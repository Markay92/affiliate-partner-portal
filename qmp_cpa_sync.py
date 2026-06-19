"""
QMP Exchange → Airtable CPA Report Sync
"""

import os
import requests
from pyairtable import Api
from datetime import date

QMP_EMAIL          = os.environ["QMP_EMAIL"]
QMP_PASSWORD       = os.environ["QMP_PASSWORD"]
AIRTABLE_TOKEN     = os.environ["AIRTABLE_TOKEN"]
AIRTABLE_BASE_ID   = os.environ["AIRTABLE_BASE_ID"]
AIRTABLE_CPA_TABLE = os.environ.get("AIRTABLE_CPA_TABLE", "CPA Report")

AFFILIATE_KEY = "117870144"
BASE_URL      = "https://exchange.qmp.ai"
CLIENT_ID     = "QMPEXCHANGE_CLIENT"
SH_API_TOKEN  = "3_dweKZ6y8-iA-2tYK5IBRxwKf5kwJsD"

REPORT_DATE = None  # None = today


def fetch_cpa(report_date: str) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/sh/api/cardPricingComparison",
        params={
            "AffiliateKey":  AFFILIATE_KEY,
            "PeriodOneDate": report_date,
        },
        headers={
            "Authorization": f"Bearer {SH_API_TOKEN}",
            "Accept":        "application/json",
        },
    )
    resp.raise_for_status()
    return resp.json()


def map_to_airtable(row: dict) -> dict:
    p1 = row.get("periodOnePublisherCommission")
    p2 = row.get("periodTwoPublisherCommission")
    pct_change = round(((p1 - p2) / p2) * 100, 2) if (p1 is not None and p2) else None

    return {
        "Source ID":             row.get("sourceId"),
        "Placement Name":        row.get("sourceName"),
        "Issuer":                row.get("accountName"),
        "Card Name":             row.get("cardName"),
        "Tier":                  row.get("tierName"),
        "Conversion Type":       row.get("conversionType"),
        "Payout Type":           row.get("payoutType"),
        "Current Net CPA":       p1,
        "Current Period Start":  (row.get("periodOneStartDate") or "")[:10] or None,
        "Previous Net CPA":      p2,
        "Previous Period Start": (row.get("periodTwoStartDate") or "")[:10] or None,
        "Previous Period End":   (row.get("periodTwoEndDate") or "")[:10] or None,
        "Percent Change":        pct_change,
        "Card Active":           row.get("cardActive"),
        "Issuer Account Active": row.get("issuerAccountActive"),
    }


def main():
    report_date = REPORT_DATE or date.today().isoformat()
    print(f"Fetching CPA report for {report_date}...")

    rows = fetch_cpa(report_date)
    print(f"  → {len(rows)} records")

    table = Api(AIRTABLE_TOKEN).table(AIRTABLE_BASE_ID, AIRTABLE_CPA_TABLE)

    created = updated = 0
    for row in rows:
        fields    = map_to_airtable(row)
        card_name = str(fields.get("Card Name", "")).replace("'", "\\'")
        issuer    = str(fields.get("Issuer", "")).replace("'", "\\'")
        formula   = f"AND({{Card Name}} = '{card_name}', {{Issuer}} = '{issuer}')"
        existing  = table.all(formula=formula)

        if existing:
            table.update(existing[0]["id"], fields)
            updated += 1
        else:
            table.create(fields)
            created += 1

    print(f"  ✓ Done — {created} created, {updated} updated")


if __name__ == "__main__":
    main()
