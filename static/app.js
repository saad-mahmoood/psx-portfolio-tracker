const COLUMNS = [
  ["Rank", "left", "input"],
  ["Symbol", "left", "input"],
  ["Name", "left", "input"],
  ["Sector", "left", "input"],
  ["Portfolio Weight %", "", "input"],
  ["Allocation Amount (Rs.)", "", "calc"],
  ["Base Case Target (Rs.)", "", "input"],
  ["Bull Case Target (Rs.)", "", "input"],
  ["LDCP (Rs.)", "", "live"],
  ["Current Price (Rs.)", "", "live"],
  ["Dividend Yield %", "", "live"],
  ["Shares to Buy", "", "calc"],
  ["Actual Amount Invested (Rs.)", "", "calc"],
  ["Unallocated Cash (Rs.)", "", "calc"],
  ["Potential Value at Base (Rs.)", "", "calc"],
  ["Potential Gain Base %", "", "calc"],
  ["Potential Value at Bull (Rs.)", "", "calc"],
  ["Potential Gain Bull %", "", "calc"],
  ["Dividend Payout Frequency", "left", "live"],
  ["Payout 1", "left", "live"],
  ["Payout 2", "left", "live"],
  ["Payout 3", "left", "live"],
  ["Payout 4", "left", "live"],
  ["Gain in Last 3 Months %", "", "live"],
  ["Gain YTD %", "", "live"],
  ["Gain in Last 52 Weeks %", "", "live"],
  ["52 Week High (Rs.)", "", "live"],
  ["52 Week Low (Rs.)", "", "live"],
];

const GAIN_INDEXES = new Set([15, 17, 23, 24, 25]);
let snapshot = null;

const amountInput = document.getElementById("amount");
const sheets = {
  portfolio: document.getElementById("portfolio"),
  inputs: document.getElementById("inputs"),
  raw: document.getElementById("raw"),
  dividends: document.getElementById("dividends"),
};

function parseAmount(text) {
  const cleaned = String(text).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function indian(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const negative = value < 0;
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  let head = whole.slice(0, -3);
  const tail = whole.slice(-3);
  if (head) head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + ",";
  return (negative ? "-" : "") + head + tail + (digits ? "." + fraction : "");
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return (value * 100).toFixed(2) + "%";
}

function cell(text, kind, stale, gain, sticky) {
  const classes = [kind];
  if (stale) classes.push("stale");
  if (gain === "pos") classes.push("pos");
  if (gain === "neg") classes.push("neg");
  if (sticky) classes.push("sticky");
  return `<td class="${classes.join(" ")}">${text}</td>`;
}

function gainClass(value) {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "";
}

function metrics(row, amount) {
  const allocation = row.weight * amount;
  const price = row.price;
  const shares = price > 0 ? Math.floor(allocation / price) : 0;
  const invested = price > 0 ? shares * price : 0;
  const cash = allocation - invested;
  return {
    allocation,
    shares,
    invested,
    cash,
    potBase: shares * row.base,
    potBull: shares * row.bull,
    gainBase: price > 0 ? row.base / price - 1 : null,
    gainBull: price > 0 ? row.bull / price - 1 : null,
    priceMissing: !(price > 0),
  };
}

function renderChecks(rows, amount) {
  const box = document.getElementById("checks");
  const notes = [];
  if (!(amount > 0)) {
    notes.push(["warn", "Total Portfolio Amount must be a positive number. Calculations are paused."]);
  } else {
    const weight = rows.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(weight - 1) > 0.0001) {
      notes.push(["warn", `Portfolio weights add up to ${pct(weight)}. They must add up to 100%.`]);
    }
    const totals = rows.reduce(
      (sum, row) => {
        const item = metrics(row, amount);
        sum.invested += item.invested;
        sum.cash += item.cash;
        return sum;
      },
      { invested: 0, cash: 0 }
    );
    const combined = totals.invested + totals.cash;
    const gap = Math.abs(combined - amount);
    if (gap < 1) {
      notes.push(["ok", `Check: invested ${indian(totals.invested)} + unallocated cash ${indian(totals.cash)} = ${indian(amount)}.`]);
    } else {
      notes.push(["warn", `Check failed: invested + unallocated cash is ${indian(combined)}, which differs from ${indian(amount)} by ${indian(gap)}.`]);
    }
  }
  box.innerHTML = notes.map(([kind, text]) => `<div class="check ${kind}">${text}</div>`).join("");
}

function renderPortfolio() {
  const amount = parseAmount(amountInput.value);
  const rows = snapshot.rows;
  renderChecks(rows, amount);
  const paused = !(amount > 0);
  const head = COLUMNS.map(([label, align], index) => {
    const sticky = index < 2 ? " sticky" : "";
    return `<th class="${align}${sticky}">${label}</th>`;
  }).join("");
  const body = rows.map((row) => {
    const item = paused ? null : metrics(row, amount);
    const flags = [...row.flags];
    if (item && item.priceMissing) flags.push("Price missing");
    if (item && item.shares === 0 && !item.priceMissing) flags.push("Allocation is below one share");
    const values = [
      [row.rank, false],
      [row.symbol, false],
      [row.name, false],
      [row.sector, false],
      [pct(row.weight), false],
      [item ? indian(item.allocation) : "—", false],
      [indian(row.base), false],
      [indian(row.bull), false],
      [indian(row.ldcp), row.stale.ldcp],
      [indian(row.price), row.stale.price],
      [pct(row.yield), row.stale.yield],
      [item ? indian(item.shares, 0) : "—", false],
      [item ? indian(item.invested) : "—", false],
      [item ? indian(item.cash) : "—", false],
      [item ? indian(item.potBase) : "—", false],
      [item ? pct(item.gainBase) : "—", false, item && item.gainBase],
      [item ? indian(item.potBull) : "—", false],
      [item ? pct(item.gainBull) : "—", false, item && item.gainBull],
      [row.frequency || "—", row.stale.frequency],
      [row.payouts[0], row.stale.payouts],
      [row.payouts[1], row.stale.payouts],
      [row.payouts[2], row.stale.payouts],
      [row.payouts[3], row.stale.payouts],
      [pct(row.gain3m), row.stale.gain3m, row.gain3m],
      [pct(row.ytd), row.stale.ytd, row.ytd],
      [pct(row.year), row.stale.year, row.year],
      [indian(row.high52), row.stale.high52],
      [indian(row.low52), row.stale.low52],
    ];
    const cells = values.map((entry, index) => {
      const [text, stale, gain] = entry;
      const align = COLUMNS[index][1] === "left" ? "left " : "";
      return cell(text, align + COLUMNS[index][2], stale, GAIN_INDEXES.has(index) ? gainClass(gain) : "", index < 2);
    }).join("");
    return `<tr class="${flags.length ? "flag" : ""}" title="${flags.join(". ")}">${cells}</tr>`;
  }).join("");

  let total = "";
  if (!paused) {
    const sums = rows.reduce((sum, row) => {
      const item = metrics(row, amount);
      sum.weight += row.weight;
      sum.allocation += item.allocation;
      sum.invested += item.invested;
      sum.cash += item.cash;
      sum.potBase += item.potBase;
      sum.potBull += item.potBull;
      sum.yield += (row.yield || 0) * item.invested;
      return sum;
    }, { weight: 0, allocation: 0, invested: 0, cash: 0, potBase: 0, potBull: 0, yield: 0 });
    const invested = sums.invested || 0;
    const yieldAvg = invested ? sums.yield / invested : null;
    const gainBase = invested ? sums.potBase / invested - 1 : null;
    const gainBull = invested ? sums.potBull / invested - 1 : null;
    const blanks = Array(28).fill("—");
    blanks[1] = "TOTAL";
    blanks[4] = pct(sums.weight);
    blanks[5] = indian(sums.allocation);
    blanks[10] = pct(yieldAvg);
    blanks[12] = indian(sums.invested);
    blanks[13] = indian(sums.cash);
    blanks[14] = indian(sums.potBase);
    blanks[15] = pct(gainBase);
    blanks[16] = indian(sums.potBull);
    blanks[17] = pct(gainBull);
    total = `<tr class="total">${blanks.map((text, index) => {
      const gain = index === 15 ? gainBase : index === 17 ? gainBull : null;
      return `<td class="${COLUMNS[index][1]} ${GAIN_INDEXES.has(index) ? gainClass(gain) : ""}">${text}</td>`;
    }).join("")}</tr>`;
  }
  sheets.portfolio.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>`;
}

function renderRaw() {
  const head = ["Symbol", "LDCP", "Price", "3M base close", "YTD base close", "1Y base close", "YTD", "1Y", "52W high", "52W low", "Yield"].map((label) => `<th>${label}</th>`).join("");
  const body = snapshot.rows.map((row) => `<tr>
    <td class="left">${row.symbol}</td>
    <td>${indian(row.ldcp)}</td><td>${indian(row.price)}</td>
    <td>${indian(row.base3m)}</td><td>${indian(row.baseYtd)}</td><td>${indian(row.base1y)}</td>
    <td>${pct(row.ytd)}</td><td>${pct(row.year)}</td>
    <td>${indian(row.high52)}</td><td>${indian(row.low52)}</td><td>${pct(row.yield)}</td>
  </tr>`).join("");
  sheets.raw.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderDividends() {
  const head = ["Symbol", "Date", "Amount (Rs.)", "Shown as"].map((label) => `<th class="left">${label}</th>`).join("");
  const body = snapshot.rows.flatMap((row) => {
    if (!row.history.length) {
      return [`<tr><td class="left">${row.symbol}</td><td class="left" colspan="3">None</td></tr>`];
    }
    return row.history.map((item) => `<tr><td class="left">${row.symbol}</td><td class="left">${item.date}</td><td>${indian(item.amount)}</td><td class="left">${row.payouts.includes("None") ? "None" : row.frequency}</td></tr>`);
  }).join("");
  sheets.dividends.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderInputs() {
  const rows = snapshot.rows.map((row, index) => `<tr>
    <td><input data-field="rank" data-index="${index}" value="${row.rank}"></td>
    <td><input data-field="symbol" data-index="${index}" value="${row.symbol}"></td>
    <td><input data-field="name" data-index="${index}" value="${escapeAttr(row.name)}"></td>
    <td><input data-field="sector" data-index="${index}" value="${escapeAttr(row.sector)}"></td>
    <td><input data-field="weight" data-index="${index}" value="${(row.weight * 100).toFixed(2)}"></td>
    <td><input data-field="base" data-index="${index}" value="${row.base}"></td>
    <td><input data-field="bull" data-index="${index}" value="${row.bull}"></td>
    <td><button type="button" data-remove="${index}">Remove</button></td>
  </tr>`).join("");
  sheets.inputs.innerHTML = `<div class="toolbar"><button type="button" id="save-inputs">Save inputs</button><button type="button" id="add-row">Add stock</button></div>
    <table class="editor"><thead><tr>
      <th>Rank</th><th>Symbol</th><th>Name</th><th>Sector</th><th>Weight %</th><th>Base target</th><th>Bull target</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  document.getElementById("save-inputs").onclick = saveInputs;
  document.getElementById("add-row").onclick = () => {
    snapshot.rows.push({ rank: snapshot.rows.length + 1, symbol: "", name: "", sector: "", weight: 0, base: 0, bull: 0, payouts: ["N/A", "N/A", "N/A", "N/A"], stale: {}, flags: [], history: [] });
    renderInputs();
  };
  sheets.inputs.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => {
      snapshot.rows.splice(Number(button.dataset.remove), 1);
      renderInputs();
    };
  });
}

function escapeAttr(value) {
  return String(value).replace(/"/g, "&quot;");
}

async function saveInputs() {
  const stocks = snapshot.rows.map((_, index) => {
    const read = (field) => sheets.inputs.querySelector(`[data-field="${field}"][data-index="${index}"]`).value.trim();
    return {
      rank: Number(read("rank")),
      symbol: read("symbol").toUpperCase(),
      name: read("name"),
      sector: read("sector"),
      weight: Number(read("weight")) / 100,
      base: Number(read("base")),
      bull: Number(read("bull")),
    };
  });
  const response = await fetch("/api/inputs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stocks }),
  });
  const payload = await response.json();
  if (!response.ok) {
    showError(payload.error || "Could not save inputs.");
    return;
  }
  await load(true);
}

function showError(message) {
  const node = document.getElementById("error");
  node.textContent = message;
  node.classList.remove("hidden");
}

function sheetModel() {
  const amount = parseAmount(amountInput.value);
  const headers = COLUMNS.map((column) => column[0]);
  const rows = snapshot.rows.map((row) => {
    const item = amount > 0 ? metrics(row, amount) : null;
    return [
      row.rank, row.symbol, row.name, row.sector, row.weight,
      item ? item.allocation : null, row.base, row.bull, row.ldcp, row.price, row.yield,
      item ? item.shares : null, item ? item.invested : null, item ? item.cash : null,
      item ? item.potBase : null, item ? item.gainBase : null,
      item ? item.potBull : null, item ? item.gainBull : null,
      row.frequency, row.payouts[0], row.payouts[1], row.payouts[2], row.payouts[3],
      row.gain3m, row.ytd, row.year, row.high52, row.low52,
    ];
  });
  const sums = snapshot.rows.reduce((sum, row) => {
    const item = amount > 0 ? metrics(row, amount) : null;
    if (!item) return sum;
    sum.weight += row.weight;
    sum.allocation += item.allocation;
    sum.invested += item.invested;
    sum.cash += item.cash;
    sum.potBase += item.potBase;
    sum.potBull += item.potBull;
    sum.yield += (row.yield || 0) * item.invested;
    return sum;
  }, { weight: 0, allocation: 0, invested: 0, cash: 0, potBase: 0, potBull: 0, yield: 0 });
  const invested = sums.invested || 0;
  const total = Array(headers.length).fill(null);
  total[1] = "TOTAL";
  total[4] = sums.weight;
  total[5] = sums.allocation;
  total[10] = invested ? sums.yield / invested : null;
  total[12] = sums.invested;
  total[13] = sums.cash;
  total[14] = sums.potBase;
  total[15] = invested ? sums.potBase / invested - 1 : null;
  total[16] = sums.potBull;
  total[17] = invested ? sums.potBull / invested - 1 : null;
  return {
    updated: snapshot.updated,
    market: snapshot.market,
    amount,
    headers,
    rows,
    total: amount > 0 ? total : null,
  };
}

async function download(path, filename) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sheetModel()),
  });
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setBusy(busy) {
  document.getElementById("refresh").disabled = busy;
  document.getElementById("export-pdf").disabled = busy || !snapshot;
  document.getElementById("export-xls").disabled = busy || !snapshot;
}

async function readPortfolio(latest) {
  const url = latest ? "/api/portfolio?latest=" + Date.now() : "/api/portfolio";
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Refresh failed");
  return payload;
}

function showPortfolio(payload) {
  snapshot = payload;
  document.getElementById("updated").textContent = payload.updated
    ? "Last updated " + payload.updated
    : "Last updated —";
  const market = document.getElementById("market");
  market.textContent = payload.market || "—";
  market.className = "pill " + (payload.marketOpen ? "open" : "closed");
  document.getElementById("stale").classList.toggle("hidden", !payload.stale);
  if (payload.rows && payload.rows.length) {
    renderPortfolio();
    renderInputs();
    renderRaw();
    renderDividends();
  }
}

async function load() {
  const loading = document.getElementById("loading");
  setBusy(true);
  loading.classList.remove("hidden");
  document.getElementById("error").classList.add("hidden");
  try {
    let payload = await readPortfolio(true);
    showPortfolio(payload);
    while (payload.refreshing) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      payload = await readPortfolio(false);
      showPortfolio(payload);
    }
    if (payload.error && !(payload.rows && payload.rows.length)) throw new Error(payload.error);
  } catch (error) {
    showError(error.message);
  } finally {
    loading.classList.add("hidden");
    setBusy(false);
  }
}

document.getElementById("refresh").onclick = load;
document.getElementById("export-pdf").onclick = () => download("/api/export.pdf", "PSX-Portfolio.pdf").catch((error) => showError(error.message));
document.getElementById("export-xls").onclick = () => download("/api/export.xlsx", "PSX-Portfolio.xlsx").catch((error) => showError(error.message));
amountInput.addEventListener("input", () => {
  if (snapshot) renderPortfolio();
});
amountInput.addEventListener("blur", () => {
  const amount = parseAmount(amountInput.value);
  if (amount > 0) {
    amountInput.value = indian(amount, Number.isInteger(amount) ? 0 : 2);
    localStorage.setItem("psx-amount", amountInput.value);
  }
});
const stored = localStorage.getItem("psx-amount");
if (stored) amountInput.value = stored;

document.querySelectorAll(".tabs button").forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    Object.entries(sheets).forEach(([name, node]) => node.classList.toggle("hidden", name !== button.dataset.tab));
  };
});

load();
