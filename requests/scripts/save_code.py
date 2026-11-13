import httpx
from posting import Posting


def on_response(response: httpx.Response, posting: Posting) -> None:
    # Remember the code of the link that was just created,
    # so the other requests can use it as ${last_code}
    if response.status_code == 201:
        code = response.json()["code"]
        posting.set_variable("last_code", code)
        posting.notify(f"last_code = {code}")
