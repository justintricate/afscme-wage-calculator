import './style.css';

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// --- DATE CONFIG ---
const retroStartDate = new Date('2025-07-01');
const currentDate = new Date(); 
const oneWeek = 1000 * 60 * 60 * 24 * 7;
// Ensure strictly positive weeks
const WEEKS_RETRO = Math.max(0, (currentDate - retroStartDate) / oneWeek);

// --- WAGE TOGGLE LOGIC (Unchanged) ---
document.getElementById('labelHourly').addEventListener('click', (e) => {
  const radio = document.getElementById('typeHourly');
  if (radio.checked) {
    e.preventDefault();
    document.getElementById('typeSalary').checked = true;
    updateWageInputs('salary');
  }
});
document.getElementById('labelSalary').addEventListener('click', (e) => {
  const radio = document.getElementById('typeSalary');
  if (radio.checked) {
    e.preventDefault();
    document.getElementById('typeHourly').checked = true;
    updateWageInputs('hourly');
  }
});
document.querySelectorAll('input[name="wageType"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    updateWageInputs(e.target.value);
  });
});

function updateWageInputs(type) {
  const label = document.getElementById('startValLabel');
  const input = document.getElementById('startVal');
  if (type === 'salary') {
    label.innerText = 'Current Annual Salary ($)';
    input.placeholder = 'e.g. 62400';
  } else {
    label.innerText = 'Current Hourly Rate ($)';
    input.placeholder = 'e.g. 30.00';
  }
}

// --- LOGIC: Split-Year Calculation ---
// Handles years where the floor might increase halfway through (July vs Jan)
function calculateSplitYear(prevRate, raisePct, flatRaise, floorH1, floorH2, annualHours) {
  // 1. Calculate Base Raise (happens July 1)
  let raiseAmount = prevRate * raisePct;
  let useFlat = flatRaise > raiseAmount;
  let baseNewRate = prevRate + (useFlat ? flatRaise : raiseAmount);
  
  // 2. Determine Rate for First Half (July - Dec)
  let rateH1 = baseNewRate < floorH1 ? floorH1 : baseNewRate;
  
  // 3. Determine Rate for Second Half (Jan - June)
  // Usually, the base rate doesn't change, but the FLOOR changes.
  let rateH2 = rateH1 < floorH2 ? floorH2 : rateH1;

  // 4. Calculate Gross
  // We assume 50% of hours in H1 and 50% in H2
  let gross = (rateH1 * (annualHours / 2)) + (rateH2 * (annualHours / 2));

  // 5. Generate Description
  let reason = "";
  if (rateH2 > rateH1) {
    reason = `Bumped to ${fmt.format(floorH2)} floor in Jan`;
  } else if (rateH1 > baseNewRate) {
    reason = `Bumped to ${fmt.format(floorH1)} floor`;
  } else {
    reason = useFlat ? `Used flat ${fmt.format(flatRaise)}` : `Used ${(raisePct * 100).toFixed(2)}%`;
  }

  return {
    rateStart: rateH1,
    rateEnd: rateH2,
    gross: gross,
    reason: reason,
    isSplit: rateH1 !== rateH2
  };
}

// Wrapper for standard years (no mid-year split)
function calculateStandardYear(prevRate, raisePct, flatRaise, floor, annualHours) {
  return calculateSplitYear(prevRate, raisePct, flatRaise, floor, floor, annualHours);
}


function calculate() {
  const startVal = parseFloat(document.getElementById('startVal').value);
  const fte = parseFloat(document.getElementById('fte').value);
  const cpiPct = parseFloat(document.getElementById('cpiScenario').value);
  
  const isSalaryInput =
    document.querySelector('input[name="wageType"]:checked').value === 'salary';

  if (!startVal) {
    alert('Please enter your current pay rate.');
    return;
  }

  const annualHours = 2080 * fte;
  let startHourly = isSalaryInput ? startVal / annualHours : startVal;

  let taGrossTotal = 0, askGrossTotal = 0;
  let html = '';

  // ==========================================
  // YEAR 1
  // ==========================================
  let y1_cpi = startHourly * (1 + cpiPct);

  // TA: 4% or 1.25. Floor $20 (Post-Ratification). 
  // We treat Y1 as standard for simplicity, applying the $20 floor immediately for forward-look
  let y1_ta = calculateStandardYear(startHourly, 0.04, 1.25, 20.00, annualHours);
  
  // ASK: 8% or 5.00. Floor $23.
  let y1_ask = calculateStandardYear(startHourly, 0.08, 5.00, 23.00, annualHours);

  // ==========================================
  // YEAR 2 (Split Floors)
  // ==========================================
  let y2_cpi = y1_cpi * (1 + cpiPct);

  // TA: 3.25%. Floor $21 (July 1) -> $22 (Jan 1)
  let y2_ta = calculateSplitYear(y1_ta.rateEnd, 0.0325, 0, 21.00, 22.00, annualHours);

  // ASK: 5% or 2.00. Floor $25. (Standard year)
  let y2_ask = calculateStandardYear(y1_ask.rateEnd, 0.05, 2.00, 25.00, annualHours);

  // ==========================================
  // YEAR 3 (Split Floors)
  // ==========================================
  let y3_cpi = y2_cpi * (1 + cpiPct);

  // TA: 3%. Floor $23 (July 1) -> $24 (Jan 1). (Ignoring June 15 $25 bump for gross calc as it's <2 weeks)
  let y3_ta = calculateSplitYear(y2_ta.rateEnd, 0.03, 0, 23.00, 24.00, annualHours);
  
  // Custom note for TA Y3 if they are near the $25 end-of-contract target
  if(y3_ta.rateEnd < 25.00) {
      y3_ta.reason += ` (Hits ${fmt.format(25)} June '28)`;
  }

  // ASK: 5% or 2.00. Floor $27.
  let y3_ask = calculateStandardYear(y2_ask.rateEnd, 0.05, 2.00, 27.00, annualHours);


  // ==========================================
  // CASH & BONUSES
  // ==========================================
  let taBonus = fte >= 0.5 ? 4500 : 2250;

  // Ask Retro: Difference in Y1 rates * weeks passed
  let hourlyIncreaseAsk = y1_ask.rateStart - startHourly;
  let askRetro = hourlyIncreaseAsk * (fte * 40) * WEEKS_RETRO;

  // ==========================================
  // RENDER
  // ==========================================
  
  // Row 1
  html += row(1, y1_cpi, y1_ta, y1_ask, annualHours);
  taGrossTotal += y1_ta.gross;
  askGrossTotal += y1_ask.gross;

  // Cash Row
  taGrossTotal += taBonus;
  askGrossTotal += askRetro;
  html += `
    <tr style="background:#eef6fc;">
        <td><strong>Immediate Cash</strong></td>
        <td class="cpi-col" style="opacity:0.5;"><small>N/A</small></td>
        <td class="ta-col">
            <div class="rate-cell">${fmt.format(taBonus)}</div>
            <span class="reason-tag">Ratification Bonus</span>
        </td>
        <td class="ask-col">
             <div class="rate-cell">${fmt.format(askRetro)}</div>
             <span class="reason-tag">Calculated Retro (~${Math.floor(WEEKS_RETRO)} wks)</span>
        </td>
        <td class="${askRetro - taBonus > 0 ? 'diff-positive' : 'diff-negative'}">
            ${askRetro - taBonus > 0 ? '+' : ''}${fmt.format(askRetro - taBonus)}
        </td>
    </tr>`;

  // Row 2
  html += row(2, y2_cpi, y2_ta, y2_ask, annualHours);
  taGrossTotal += y2_ta.gross;
  askGrossTotal += y2_ask.gross;

  // Row 3
  html += row(3, y3_cpi, y3_ta, y3_ask, annualHours);
  taGrossTotal += y3_ta.gross;
  askGrossTotal += y3_ask.gross;

  // Final Sums
  document.getElementById('tableBody').innerHTML = html;
  document.getElementById('taTotalGross').innerText = fmt.format(taGrossTotal);
  document.getElementById('askTotalGross').innerText = fmt.format(askGrossTotal);
  document.getElementById('finalDiff').innerText = fmt.format(askGrossTotal - taGrossTotal);
  document.getElementById('taBonusNote').innerText = `Includes ${fmt.format(taBonus)} bonus`;
  document.getElementById('resultsArea').style.display = 'block';
}

function renderRateCell(res, annualHours) {
    // If rate split mid-year (e.g. 21 -> 22), show range
    if (res.isSplit) {
        return `
            <div class="rate-cell">
                ${fmt.format(res.rateStart)} <span style="color:#666; font-size:0.8em">➜</span> ${fmt.format(res.rateEnd)}
            </div>
            <div class="annual-sub">(${fmt.format(res.gross)}/yr)</div>
        `;
    }
    // Standard view
    return `
        <div class="rate-cell">${fmt.format(res.rateEnd)}/hr</div>
        <div class="annual-sub">(${fmt.format(res.gross)}/yr)</div>
    `;
}

function renderSimpleRate(rate, annualHours) {
    return `
        <div class="rate-cell">${fmt.format(rate)}/hr</div>
        <div class="annual-sub">(${fmt.format(rate * annualHours)}/yr)</div>
    `;
}

function row(year, cpi, taRes, askRes, annualHours) {
  let hDiff = askRes.gross - taRes.gross; // Compare GROSS for diff, more accurate with splits
  return `<tr>
        <td><strong>Year ${year}</strong></td>
        <td class="cpi-col">${renderSimpleRate(cpi, annualHours)}</td>
        
        <td class="ta-col ${taRes.rateEnd < cpi ? 'losing-to-inflation' : ''}">
            ${renderRateCell(taRes, annualHours)}
            <span class="reason-tag">${taRes.reason}</span>
        </td>
        
        <td class="ask-col ${askRes.rateEnd < cpi ? 'losing-to-inflation' : ''}">
             ${renderRateCell(askRes, annualHours)}
             <span class="reason-tag">${askRes.reason}</span>
        </td>
        
        <td class="${hDiff > 0 ? 'diff-positive' : 'diff-negative'}">
            ${hDiff > 0 ? '+' : ''}${fmt.format(hDiff)}
             <div class="annual-sub" style="opacity: 0.7">
                (Gross Diff)
            </div>
        </td>
    </tr>`;
}

document.querySelector('#runBtn').addEventListener('click', calculate);
