"""
instantly_client.py — thin wrapper over the Instantly.ai v2 REST API.

Only the 2 calls this service needs. Endpoints and field names verified
against developer.instantly.ai (2026-08-05):
  - POST   /api/v2/leads        (add a lead to a campaign)
  - DELETE /api/v2/leads        (bulk delete, scoped to a campaign)
"""
import requests

BASE = "https://api.instantly.ai/api/v2"


class InstantlyClient:
    def __init__(self, api_key: str):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def create_lead(self, campaign_id: str, email: str, company_name: str,
                     personalization: str, custom_variables: dict) -> dict:
        """Add one lead to a campaign. Returns the created lead object (has 'id')."""
        r = self.session.post(f"{BASE}/leads", json={
            "campaign": campaign_id,
            "email": email,
            "company_name": company_name,
            "personalization": personalization,
            "custom_variables": custom_variables,
            "skip_if_in_campaign": True,
            "skip_if_in_workspace": True,
        }, timeout=30)
        r.raise_for_status()
        return r.json()

    def bulk_delete(self, campaign_id: str, lead_ids: list[str]) -> dict:
        """Delete specific leads, scoped to the campaign they're in."""
        if not lead_ids:
            return {"deleted": 0}
        r = self.session.delete(f"{BASE}/leads", json={
            "campaign_id": campaign_id,
            "ids": lead_ids,
        }, timeout=30)
        r.raise_for_status()
        return r.json()
