---
name: data-fetcher
description: Fetch economic data from FRED, World Bank, BLS, OECD, and Yahoo Finance
---
## Workflow Integration

若当前会话由 Coase 研究工作流触发（`/full-research` / `/idea-to-results` / `/run-experiment`），本 skill 的输出必须按以下规则落入阶段文件，**不得自行新建目录或脱离工作流上下文**：

- **规划阶段 · Idea–Data Alignment**: 评估数据可行性，列出取数方案、API/数据源、预期样本范围、时间覆盖，填入 `planner/stage_1_alignment.md`。若用户未提供数据，给出最小可行取数方案。
- **执行阶段 · Run Baseline 前**: 按 planner 确认的取数方案实际抓取数据，抓取脚本与日志写入 `executor/stage_1_run_baseline.md` 的"数据来源"小节。

若用户未指定工作流（直接提问使用本方法），忽略本节，按下方正文自由执行。

---

# Data-Fetcher

## Purpose

This skill helps economists fetch data from major economic data APIs including FRED (Federal Reserve Economic Data), World Bank, BLS (Bureau of Labor Statistics), OECD, and Yahoo Finance. It generates clean, documented Python code with proper error handling.

## When to Use

- Downloading macroeconomic indicators
- Building custom datasets from multiple sources
- Automating data updates for ongoing projects
- Fetching cross-country panel data

## Instructions

### Step 1: Identify Data Requirements

Ask the user:
1. What data do you need? (GDP, unemployment, inflation, etc.)
2. What time period and frequency?
3. What countries/regions?
4. Preferred output format? (CSV, DataFrame, etc.)

### Step 2: Select Appropriate API

| Data Type | Best Source | Package |
|-----------|------------|---------|
| US macro | FRED | `fredapi` |
| Global development | World Bank | `wbdata` |
| Labor statistics | BLS | `bls` |
| Cross-country | OECD | `pandasdmx` |
| Financial | Yahoo Finance | `yfinance` |

### Step 3: Generate Clean Code

Include:
- API key handling (environment variables)
- Error handling for API failures
- Data cleaning and formatting
- Documentation of series definitions

## Example Output

```python
"""
Economic Data Fetcher
=====================
Downloads macroeconomic data from FRED and World Bank APIs.
Requires: fredapi, wbdata, pandas

Setup: Set FRED_API_KEY environment variable
Get a free key from: https://fred.stlouisfed.org/docs/api/api_key.html
"""

import os
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Optional, Dict

# ============================================
# FRED Data Fetcher
# ============================================

def fetch_fred_series(
    series_ids: List[str],
    start_date: str = "2000-01-01",
    end_date: Optional[str] = None,
    api_key: Optional[str] = None
) -> pd.DataFrame:
    """
    Fetch time series data from FRED.
    
    Parameters
    ----------
    series_ids : list of str
        FRED series IDs (e.g., ['GDP', 'UNRATE', 'CPIAUCSL'])
    start_date : str
        Start date in YYYY-MM-DD format
    end_date : str, optional
        End date (defaults to today)
    api_key : str, optional
        FRED API key (defaults to FRED_API_KEY env var)
    
    Returns
    -------
    pd.DataFrame
        DataFrame with date index and series as columns
    
    Example
    -------
    >>> df = fetch_fred_series(['GDP', 'UNRATE'], '2010-01-01')
    """
    try:
        from fredapi import Fred
    except ImportError:
        raise ImportError("Install fredapi: pip install fredapi")
    
    # Get API key
    api_key = api_key or os.environ.get('FRED_API_KEY')
    if not api_key:
        raise ValueError(
            "FRED API key required. Set FRED_API_KEY environment variable "
            "or pass api_key parameter. Get a key at: "
            "https://fred.stlouisfed.org/docs/api/api_key.html"
        )
    
    fred = Fred(api_key=api_key)
    end_date = end_date or datetime.now().strftime('%Y-%m-%d')
    
    # Fetch each series
    data = {}
    for series_id in series_ids:
        try:
            series = fred.get_series(
                series_id,
                observation_start=start_date,
                observation_end=end_date
            )
            data[series_id] = series
            print(f"✓ Downloaded {series_id}")
        except Exception as e:
            print(f"✗ Failed to download {series_id}: {e}")
    
    # Combine into DataFrame
    df = pd.DataFrame(data)
    df.index.name = 'date'
    
    return df


# Common FRED series for economists
FRED_SERIES = {
    # GDP and Output
    'GDP': 'Gross Domestic Product',
    'GDPC1': 'Real GDP',
    'GDPPOT': 'Real Potential GDP',
    
    # Labor Market
    'UNRATE': 'Unemployment Rate',
    'PAYEMS': 'Total Nonfarm Payrolls',
    'CIVPART': 'Labor Force Participation Rate',
    
    # Prices
    'CPIAUCSL': 'Consumer Price Index',
    'PCEPI': 'PCE Price Index',
    'CPILFESL': 'Core CPI',
    
    # Interest Rates
    'FEDFUNDS': 'Federal Funds Rate',
    'DGS10': '10-Year Treasury Rate',
    'T10Y2Y': '10Y-2Y Treasury Spread',
    
    # Money and Credit
    'M2SL': 'M2 Money Stock',
    'TOTRESNS': 'Total Reserves',
}


# ============================================
# World Bank Data Fetcher
# ============================================

def fetch_world_bank_data(
    indicators: Dict[str, str],
    countries: List[str] = ['USA', 'GBR', 'DEU', 'FRA', 'JPN'],
    start_year: int = 2000,
    end_year: Optional[int] = None
) -> pd.DataFrame:
    """
    Fetch indicator data from World Bank.
    
    Parameters
    ----------
    indicators : dict
        Dict mapping indicator codes to names
        e.g., {'NY.GDP.PCAP.CD': 'gdp_per_capita'}
    countries : list of str
        ISO 3-letter country codes
    start_year : int
        Start year
    end_year : int, optional
        End year (defaults to current year)
    
    Returns
    -------
    pd.DataFrame
        Panel data with country and year
    
    Example
    -------
    >>> indicators = {
    ...     'NY.GDP.PCAP.CD': 'gdp_per_capita',
    ...     'SP.POP.TOTL': 'population'
    ... }
    >>> df = fetch_world_bank_data(indicators, ['USA', 'GBR'])
    """
    try:
        import wbdata
    except ImportError:
        raise ImportError("Install wbdata: pip install wbdata")
    
    end_year = end_year or datetime.now().year
    
    all_data = []
    
    for indicator_code, indicator_name in indicators.items():
        try:
            # Fetch data
            data = wbdata.get_dataframe(
                {indicator_code: indicator_name},
                country=countries,
            )
            data = data.reset_index()
            all_data.append(data)
            print(f"✓ Downloaded {indicator_name}")
            
        except Exception as e:
            print(f"✗ Failed to download {indicator_name}: {e}")
    
    # Merge all indicators
    if all_data:
        df = all_data[0]
        for other_df in all_data[1:]:
            df = df.merge(other_df, on=['country', 'date'], how='outer')
        
        # Filter years
        df['year'] = pd.to_datetime(df['date']).dt.year
        df = df[(df['year'] >= start_year) & (df['year'] <= end_year)]
        
        return df
    
    return pd.DataFrame()


# Common World Bank indicators
WORLD_BANK_INDICATORS = {
    # Income and Growth
    'NY.GDP.PCAP.CD': 'GDP per capita (current US$)',
    'NY.GDP.PCAP.KD.ZG': 'GDP per capita growth (%)',
    'NY.GDP.MKTP.KD.ZG': 'GDP growth (%)',
    
    # Population
    'SP.POP.TOTL': 'Population, total',
    'SP.URB.TOTL.IN.ZS': 'Urban population (%)',
    
    # Trade
    'NE.TRD.GNFS.ZS': 'Trade (% of GDP)',
    'BX.KLT.DINV.WD.GD.ZS': 'FDI, net inflows (% of GDP)',
    
    # Human Capital
    'SE.XPD.TOTL.GD.ZS': 'Education expenditure (% of GDP)',
    'SH.XPD.CHEX.GD.ZS': 'Health expenditure (% of GDP)',
    
    # Inequality
    'SI.POV.GINI': 'Gini index',
    'SI.POV.DDAY': 'Poverty headcount ratio ($1.90/day)',
}


# ============================================
# Usage Example
# ============================================

if __name__ == "__main__":
    # Example 1: Fetch US macro data from FRED
    us_macro = fetch_fred_series(
        series_ids=['GDP', 'UNRATE', 'CPIAUCSL', 'FEDFUNDS'],
        start_date='2010-01-01'
    )
    
    print("\nUS Macro Data (FRED):")
    print(us_macro.tail())
    
    # Save to CSV
    us_macro.to_csv('data/us_macro_fred.csv')
    print("\nSaved to data/us_macro_fred.csv")
    
    # Example 2: Fetch cross-country data from World Bank
    indicators = {
        'NY.GDP.PCAP.CD': 'gdp_per_capita',
        'SP.POP.TOTL': 'population',
        'NY.GDP.MKTP.KD.ZG': 'gdp_growth'
    }
    
    cross_country = fetch_world_bank_data(
        indicators=indicators,
        countries=['USA', 'GBR', 'DEU', 'FRA', 'JPN', 'CHN', 'IND', 'BRA'],
        start_year=2000
    )
    
    print("\nCross-Country Data (World Bank):")
    print(cross_country.head(10))
    
    # Save to CSV
    cross_country.to_csv('data/cross_country_wb.csv', index=False)
    print("\nSaved to data/cross_country_wb.csv")
```

## BLS Data Fetcher

```python
"""
BLS (Bureau of Labor Statistics) Data Fetcher
==============================================
Fetches labor market data from BLS Public Data API v2.
Requires: requests, pandas
API key (free): https://www.bls.gov/developers/
"""

import os
import json
import requests
import pandas as pd
from typing import List, Optional

def fetch_bls_series(
    series_ids: List[str],
    start_year: str = "2010",
    end_year: Optional[str] = None,
    api_key: Optional[str] = None
) -> pd.DataFrame:
    """
    Fetch time series data from BLS API v2.

    Parameters
    ----------
    series_ids : list of str
        BLS series IDs (e.g., ['LNS14000000'] for unemployment rate)
    start_year : str
        Start year (YYYY)
    end_year : str, optional
        End year (defaults to current year)
    api_key : str, optional
        BLS API key (defaults to BLS_API_KEY env var)

    Example
    -------
    >>> df = fetch_bls_series(['LNS14000000', 'CES0000000001'], '2015')
    """
    import datetime
    api_key = api_key or os.environ.get('BLS_API_KEY')
    end_year = end_year or str(datetime.datetime.now().year)

    url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
    payload = {
        "seriesid": series_ids,
        "startyear": start_year,
        "endyear": end_year,
    }
    if api_key:
        payload["registrationkey"] = api_key

    response = requests.post(url, json=payload)
    response.raise_for_status()
    data = response.json()

    if data["status"] != "REQUEST_SUCCEEDED":
        raise ValueError(f"BLS API error: {data.get('message', 'Unknown error')}")

    records = []
    for series in data["Results"]["series"]:
        sid = series["seriesID"]
        for obs in series["data"]:
            records.append({
                "series_id": sid,
                "year": int(obs["year"]),
                "period": obs["period"],
                "value": float(obs["value"]) if obs["value"] != "-" else None,
            })

    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(
        df["year"].astype(str) + df["period"].str.replace("M", "-"), format="%Y-%m"
    )
    return df.pivot(index="date", columns="series_id", values="value").sort_index()


# Common BLS series IDs
BLS_SERIES = {
    "LNS14000000": "Unemployment Rate (seasonally adjusted)",
    "CES0000000001": "Total Nonfarm Employment (thousands)",
    "LNS11300000": "Labor Force Participation Rate",
    "CES0500000003": "Average Hourly Earnings, Private Sector",
    "CUUR0000SA0": "CPI-U, All Urban Consumers",
    "PCU------": "Producer Price Index, All Commodities",
}
```

## OECD Data Fetcher

```python
"""
OECD Data Fetcher
=================
Fetches cross-country data from OECD SDMX API.
Requires: requests, pandas
No API key required.
"""

import requests
import pandas as pd
from typing import List, Optional


def fetch_oecd_data(
    dataset: str,
    subject: str = "TOT",
    countries: Optional[List[str]] = None,
    start_year: Optional[str] = None,
    end_year: Optional[str] = None,
) -> pd.DataFrame:
    """
    Fetch data from OECD SDMX API.

    Parameters
    ----------
    dataset : str
        OECD dataset code (e.g., 'QNA' for quarterly national accounts)
    subject : str
        Subject/measure code within dataset
    countries : list of str, optional
        ISO 2-letter country codes (e.g., ['USA', 'GBR', 'DEU'])
        Defaults to all OECD members.
    start_year : str, optional
        Start year (YYYY)
    end_year : str, optional
        End year (YYYY)

    Returns
    -------
    pd.DataFrame
        Long-format panel with country, time, value columns

    Example
    -------
    >>> df = fetch_oecd_data('QNA', 'B1_GE', ['USA', 'GBR'], '2010', '2023')
    """
    country_str = "+".join(countries) if countries else "all"
    url = (
        f"https://stats.oecd.org/SDMX-JSON/data/{dataset}/"
        f"{country_str}.{subject}.../all?contentType=csv"
    )
    if start_year:
        url += f"&startTime={start_year}"
    if end_year:
        url += f"&endTime={end_year}"

    resp = requests.get(url, timeout=60)
    resp.raise_for_status()

    from io import StringIO
    df = pd.read_csv(StringIO(resp.text))
    df.columns = df.columns.str.lower().str.strip()
    return df


# Common OECD datasets
OECD_DATASETS = {
    "QNA":     "Quarterly National Accounts (GDP, components)",
    "MEI":     "Main Economic Indicators (macro overview)",
    "ALFS":    "Annual Labour Force Statistics (employment, wages)",
    "HEALTH":  "Health Statistics",
    "EAG":     "Education at a Glance (PISA, attainment)",
    "REVSTATS":"Revenue Statistics (tax-to-GDP)",
    "FDI":     "Foreign Direct Investment Statistics",
}
```

## Yahoo Finance Data Fetcher

```python
"""
Yahoo Finance Data Fetcher
==========================
Fetches financial and commodity price data.
Requires: yfinance, pandas
No API key required.
"""

import pandas as pd
from typing import List, Optional


def fetch_yahoo_finance(
    tickers: List[str],
    start_date: str = "2010-01-01",
    end_date: Optional[str] = None,
    price_col: str = "Adj Close",
) -> pd.DataFrame:
    """
    Fetch price data from Yahoo Finance.

    Parameters
    ----------
    tickers : list of str
        Yahoo Finance ticker symbols (e.g., ['^GSPC', 'AAPL', 'GC=F'])
    start_date : str
        Start date in YYYY-MM-DD format
    end_date : str, optional
        End date (defaults to today)
    price_col : str
        Which price column to return ('Adj Close', 'Close', 'Volume', etc.)

    Returns
    -------
    pd.DataFrame
        Wide-format DataFrame with tickers as columns

    Example
    -------
    >>> df = fetch_yahoo_finance(['^GSPC', '^VIX', 'GC=F'], '2015-01-01')
    """
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError("Install yfinance: pip install yfinance")

    import datetime
    end_date = end_date or datetime.date.today().isoformat()

    raw = yf.download(tickers, start=start_date, end=end_date, auto_adjust=True)
    if isinstance(raw.columns, pd.MultiIndex):
        df = raw[price_col] if len(tickers) > 1 else raw[[price_col]].rename(columns={price_col: tickers[0]})
    else:
        df = raw[[price_col]].rename(columns={price_col: tickers[0]})
    return df.dropna(how="all")


# Common Yahoo Finance tickers for economists
YAHOO_TICKERS = {
    # Equity Indices
    "^GSPC":  "S&P 500",
    "^DJI":   "Dow Jones Industrial Average",
    "^IXIC":  "NASDAQ Composite",
    # Volatility
    "^VIX":   "CBOE Volatility Index (VIX)",
    # Commodities
    "GC=F":   "Gold Futures",
    "CL=F":   "Crude Oil (WTI) Futures",
    # FX
    "EURUSD=X": "EUR/USD Exchange Rate",
    "GBPUSD=X": "GBP/USD Exchange Rate",
    # Bonds
    "^TNX":   "10-Year Treasury Yield",
    "^TYX":   "30-Year Treasury Yield",
}
```

## Requirements

### Python Packages
```bash
pip install fredapi wbdata pandas requests yfinance
```

### API Keys
- **FRED**: Free key from https://fred.stlouisfed.org/docs/api/api_key.html
- **World Bank**: No key required
- **BLS**: Free key from https://www.bls.gov/developers/ (optional; increases rate limits)
- **OECD**: No key required
- **Yahoo Finance**: No key required

Set environment variables:
```bash
export FRED_API_KEY="your_fred_key"
export BLS_API_KEY="your_bls_key"   # optional
```

## Best Practices

1. **Store API keys in environment variables** - never hardcode
2. **Add rate limiting** for bulk downloads
3. **Cache data locally** to avoid repeated API calls
4. **Document series definitions** from the source
5. **Check for revisions** in real-time data

## Common Pitfalls

- ❌ Hardcoding API keys in scripts
- ❌ Not handling API rate limits
- ❌ Ignoring data vintages/revisions
- ❌ Mixing data frequencies without proper handling

## Related Skills & Commands

- **data-cleaning**: Clean and transform the fetched data for analysis
- **stats**: Generate summary statistics of downloaded data
- **/analyze**: Start a full analysis workflow with your dataset
- **panel-data**: If you fetched cross-country panel data
- **time-series**: If you fetched time series macro data