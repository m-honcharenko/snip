import httpx
from posting import Posting


def on_response(response: httpx.Response, posting: Posting) -> None:
    # Remember the alias of the link that was just created,
    # so the other requests can use it as ${last_alias}.
    # An alias is the short code itself, so last_code is updated too
    # and the requests that use ${last_code} keep working.
    if response.status_code == 201:
        alias = response.json()["code"]
        posting.set_variable("last_alias", alias)
        posting.set_variable("last_code", alias)
        posting.notify(f"last_alias = {alias}")
