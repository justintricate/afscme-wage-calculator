import './style.css';

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const WEEKS_RETRO = 19;

const elements = {
  labelHourly: document.getElementById('labelHourly'),
  labelSalary: document.getElementById('labelSalary'),
  typeHourly: document.getElementById('typeHourly'),
  typeSalary: document.getElementById('typeSalary'),
  startValLabel: document.getElementById('startValLabel'),
  startVal: document.getElementById('startVal'),
  tableBody: document.getElementById('tableBody'),
  ohsuTotalGross: document.getElementById('ohsuTotalGross'),
  afscmeTotalGross: document.getElementById('afscmeTotalGross'),
  finalDiff: document.getElementById('finalDiff'),
  resultsArea: document.getElementById('resultsArea'),
  runBtn: document.querySelector('#runBtn'),
};

elements.labelHourly.addEventListener('click', (e) => {
  if (elements.typeHourly.checked) {
    e.preventDefault();
    elements.typeSalary.checked = true;
    updateWageInputs('salary');
  }
});

elements.labelSalary.addEventListener('click', (e) => {
  if (elements.typeSalary.checked) {
    e.preventDefault();
    elements.typeHourly.checked = true;
    updateWageInputs('hourly');
  }
});

document.querySelectorAll('input[name="wageType"]').forEach((radio) => {
  radio.addEventListener('change', (e) => updateWageInputs(e.target.value));
});

function updateWageInputs(type) {
  if (type === 'salary') {
    elements.startValLabel.innerText = 'Current Annual Salary ($)';
    elements.startVal.placeholder = 'e.g. 62400';
  } else {
    elements.startValLabel.innerText = 'Current Hourly Rate ($)';
    elements.startVal.placeholder = 'e.g. 30.00';
  }
}

function applyRaise(currentRate, pct, flat, floor) {
  const raisePct = currentRate * pct;
  const useFlat = flat > raisePct;
  const tempRate = currentRate + (useFlat ? flat : raisePct);
  const hitFloor = tempRate < floor;
  const finalRate = hitFloor ? floor : tempRate;
  const reason = hitFloor
    ? `Bumped to ${fmt.format(floor)} floor`
    : useFlat && flat > 0
    ? `Used flat ${fmt.format(flat)} increase`
    : `Used ${(pct * 100).toFixed(1)}% increase`;
  return { rate: finalRate, reason };
}

function renderDual(hourlyRate, annualHours) {
  return `<div class="rate-cell">${fmt.format(
    hourlyRate
  )}/hr</div><div class="annual-sub">(${fmt.format(
    hourlyRate * annualHours
  )}/yr)</div>`;
}

function buildRow(year, cpi, oRes, aRes, annualHours) {
  const hDiff = aRes.rate - oRes.rate;
  const diffClass = hDiff > 0 ? 'diff-positive' : 'diff-negative';
  const ohsuInflationClass = oRes.rate < cpi ? 'losing-to-inflation' : '';
  const afscmeInflationClass = aRes.rate < cpi ? 'losing-to-inflation' : '';

  return `<tr>
    <td><strong>Year ${year}</strong></td>
    <td class="cpi-col">${renderDual(cpi, annualHours)}</td>
    <td class="ohsu-col ${ohsuInflationClass}">
      ${renderDual(oRes.rate, annualHours)}
      <span class="reason-tag">${oRes.reason}</span>
    </td>
    <td class="afscme-col ${afscmeInflationClass}">
      ${renderDual(aRes.rate, annualHours)}
      <span class="reason-tag">${aRes.reason}</span>
    </td>
    <td class="${diffClass}">
      ${hDiff > 0 ? '+' : ''}${fmt.format(hDiff * annualHours)}
      <div class="annual-sub" style="opacity: 0.7">(${
        hDiff > 0 ? '+' : ''
      }${fmt.format(hDiff)}/hr)</div>
    </td>
  </tr>`;
}

function calculate() {
  const startVal = parseFloat(elements.startVal.value);
  const fte = parseFloat(document.getElementById('fte').value);
  const cpiPct = parseFloat(document.getElementById('cpiScenario').value);
  const isSalaryInput =
    document.querySelector('input[name="wageType"]:checked').value === 'salary';

  if (!startVal) {
    alert('Please enter your current pay rate.');
    return;
  }

  const annualHours = 2080 * fte;
  const startHourly = isSalaryInput ? startVal / annualHours : startVal;
  let oRate = startHourly,
    aRate = startHourly,
    cpiRate = startHourly;
  let oGross = 0,
    aGross = 0;
  const rows = [];

  cpiRate *= 1 + cpiPct;
  const oRes1 = applyRaise(oRate, 0.04, 1.25, 22.0);
  oRate = oRes1.rate;
  const aRes1 = applyRaise(aRate, 0.08, 5.0, 23.0);
  aRate = aRes1.rate;
  rows.push(buildRow(1, cpiRate, oRes1, aRes1, annualHours));
  oGross += oRate * annualHours;
  aGross += aRate * annualHours;

  const ohsuCash = fte >= 0.5 ? 1250 : 625;
  const hourlyIncrease = aRate - startHourly;
  const afscmeRetro = hourlyIncrease * fte * 40 * WEEKS_RETRO;
  oGross += ohsuCash;
  aGross += afscmeRetro;

  const cashDiff = afscmeRetro - ohsuCash;
  rows.push(`<tr style="background:#eef6fc;">
    <td><strong>Immediate Cash</strong></td>
    <td class="cpi-col" style="opacity:0.5;"><small>N/A</small></td>
    <td class="ohsu-col">
      <div class="rate-cell">${fmt.format(ohsuCash)}</div>
      <span class="reason-tag">Ratification Bonus</span>
    </td>
    <td class="afscme-col">
      <div class="rate-cell">${fmt.format(afscmeRetro)}</div>
      <span class="reason-tag">Est. Retro Pay (~${WEEKS_RETRO} weeks)</span>
    </td>
    <td class="${cashDiff > 0 ? 'diff-positive' : 'diff-negative'}">
      ${cashDiff > 0 ? '+' : ''}${fmt.format(cashDiff)}
    </td>
  </tr>`);

  cpiRate *= 1 + cpiPct;
  const oRes2 = applyRaise(oRate, 0.025, 0, 22.55);
  oRate = oRes2.rate;
  const aRes2 = applyRaise(aRate, 0.05, 2.0, 25.0);
  aRate = aRes2.rate;
  rows.push(buildRow(2, cpiRate, oRes2, aRes2, annualHours));
  oGross += oRate * annualHours;
  aGross += aRate * annualHours;

  cpiRate *= 1 + cpiPct;
  const oRes3 = applyRaise(oRate, 0.025, 0, 23.11);
  oRate = oRes3.rate;
  const aRes3 = applyRaise(aRate, 0.05, 2.0, 27.0);
  aRate = aRes3.rate;
  rows.push(buildRow(3, cpiRate, oRes3, aRes3, annualHours));
  oGross += oRate * annualHours;
  aGross += aRate * annualHours;

  elements.tableBody.innerHTML = rows.join('');
  elements.ohsuTotalGross.innerText = fmt.format(oGross);
  elements.afscmeTotalGross.innerText = fmt.format(aGross);
  elements.finalDiff.innerText = fmt.format(aGross - oGross);
  elements.resultsArea.style.display = 'block';
}

elements.runBtn.addEventListener('click', calculate);
