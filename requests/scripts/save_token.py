import httpx
from posting import Posting


def on_response(response: httpx.Response, posting: Posting) -> None:
    # Remember the access token, so the other requests can send it
    # as "Authorization: Bearer ${token}"
    if response.status_code in (200, 201):
        posting.set_variable("token", response.json()["accessToken"])
        posting.notify("token saved")
