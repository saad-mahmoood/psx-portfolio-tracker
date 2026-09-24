# PSX Portfolio Tracker

A local sheet for 27 Pakistan Stock Exchange stocks. One amount at the top resizes the whole portfolio. Prices, dividends, and performance refresh from public pages when you open the app or press **Fetch Latest**.

## Run it

```bash
pip install openpyxl reportlab
python server.py
```

Open http://127.0.0.1:8765

`openpyxl` writes the Excel file. `reportlab` writes the PDF. The server itself uses only the Python standard library.

## What you can do

- Type **Total Portfolio Amount (Rs.)**. Default is 5,00,000. Indian grouping such as `10,00,000` is accepted.
- **Fetch Latest** reloads every live field.
- **Export PDF** and **Export XLS** download the sheet as it looks now, including the amount you typed. The Excel file is `.xlsx`.
- **Inputs** edits rank, symbol, name, sector, weight, and the two price targets. Saving writes `data/inputs.json` and refreshes the sheet.
- The header says whether the market is open. PSX hours used here are Monday to Friday, 9:30 AM to 3:30 PM Pakistan time.

## Where the numbers come from

Symbols are matched by PSX ticker (`OGDC`, `MARI`), not by company name.

| Field | Source |
| --- | --- |
| LDCP, current price | [PSX market watch](https://dps.psx.com.pk/market-watch), one page for every symbol |
| 52-week high and low, YTD %, 1-year % | Each company's page on [dps.psx.com.pk](https://dps.psx.com.pk/), first quote block only |
| 3-month gain | Current price against the PSX daily close from three calendar months ago |
| Dividend yield, frequency, payout history | [StockAnalysis](https://stockanalysis.com/quote/psx/OGDC/dividend/) company dividend page |

The TradingView watchlist in the original brief is private, so it is not used. YTD and the 1-year change are the percentages PSX already publishes. If PSX does not publish one, it is calculated as `(current price / older close) - 1` from the daily history at `https://dps.psx.com.pk/timeseries/eod/{SYMBOL}`.

A fetch that fails keeps the previous value, paints that cell grey, and shows **Stale data** next to the clock. A successful answer is never marked stale. **None** means the source says this company has no dividend record. **N/A** means the sheet always has four payout columns and this company has fewer than four past dividends.

Upcoming ex-dates are skipped. Payout 1 is the latest dividend whose ex-date is today or earlier.

## Formulas

`Amount` is the single amount at the top. `Weight` is the portfolio weight as a fraction (6% is `0.06`).

```text
Allocation              = Weight × Amount
Shares to Buy           = floor(Allocation / Current Price)
Actual Amount Invested  = Shares × Current Price
Unallocated Cash        = Allocation − Actual Amount Invested
Potential Value at Base = Shares × Base Case Target
Potential Value at Bull = Shares × Bull Case Target
Potential Gain Base %   = (Base Case Target / Current Price) − 1
Potential Gain Bull %   = (Bull Case Target / Current Price) − 1
Gain in 3 Months %      = (Current Price / close three months ago) − 1
```

If the price is missing or zero, shares are 0 and the whole allocation stays in unallocated cash. If the allocation is smaller than one share, shares are 0 for the same reason.

A price more than 20% away from LDCP flags that row for review.

### Total row

Sums: weight, allocation, amount invested, unallocated cash, potential value at base, potential value at bull.

```text
Dividend yield on the total     = sum(yield × amount invested) / sum(amount invested)
Potential gain base on the total = (sum of potential value at base / sum invested) − 1
Potential gain bull on the total = (sum of potential value at bull / sum invested) − 1
```

Those two gain totals are taken from the summed rupee columns, not by averaging the row percentages. With weights at 100%, invested cash plus unallocated cash equals the amount at the top. Weights that do not add up to 100% show a warning.

## How the code is split

```text
server.py           Fetch, cache, formulas' inputs, Excel and PDF
static/index.html   Page shell and the three buttons
static/app.js       Sheet math, formatting, tabs, downloads
static/styles.css   Colors: input, live, calculated, stale
data/inputs.json    The 27 stocks: rank, symbol, name, sector, weight, targets
data/cache.json     Last good live values, created on first refresh, not committed
```

`server.py` does not calculate shares or rupee totals. It returns prices, yields, payouts, and performance. `app.js` applies the formulas above, so changing the amount updates the sheet without another fetch.

On each refresh the server:

1. Reads `data/inputs.json`.
2. Downloads the market-watch table once and reads LDCP and the current price for each ticker.
3. For each symbol, in parallel, downloads the company page, the daily history, and the StockAnalysis dividend page.
4. Keeps a previous value only when that download fails.
5. Writes `data/cache.json` and returns JSON to the page.

Market status is computed in Pakistan time. It does not come from the exchange feed.

Colors on the sheet:

- **Input** — rank, symbol, name, sector, weight, base target, bull target
- **Live** — prices, yield, dividends, gains, 52-week range
- **Calculated** — allocation, shares, invested cash, unallocated cash, potential values and gains
- **Stale** — a live cell whose source failed this run

## Payout text

Frequency is one of `Quarterly`, `Semi Annual`, `Annual`, or `None`. Each payout looks like `Rs. 6.00 (Q)`, `Rs. 7.50 (SA)`, or `Rs. 12.00 (Ann.)`. If StockAnalysis does not name a frequency but history exists, the gap between the last payouts is used: under 140 days is quarterly, under 270 days is semi annual, otherwise annual.
