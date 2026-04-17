"""Browser/web scraping tool for the agent (headless)."""

from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup


@dataclass
class BrowseResult:
    url: str
    title: str
    text: str
    links: list[dict[str, str]]
    status_code: int
    success: bool
    error: str | None = None

    @property
    def summary(self) -> str:
        if not self.success:
            return f"Error browsing {self.url}: {self.error}"
        text_preview = self.text[:2000] + "..." if len(self.text) > 2000 else self.text
        return f"Title: {self.title}\n\n{text_preview}"


class BrowserTool:
    """Headless web browser for fetching and parsing web pages."""

    def __init__(self, timeout: int = 15):
        self.timeout = timeout
        self._headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        }

    async def browse(self, url: str) -> BrowseResult:
        """Fetch a URL and extract text content."""
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                follow_redirects=True,
                headers=self._headers,
            ) as client:
                resp = await client.get(url)

            soup = BeautifulSoup(resp.text, "html.parser")

            # Remove script and style elements
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            title = soup.title.string.strip() if soup.title and soup.title.string else ""
            text = soup.get_text(separator="\n", strip=True)

            # Extract links
            links: list[dict[str, str]] = []
            for a in soup.find_all("a", href=True)[:50]:
                href = a["href"]
                link_text = a.get_text(strip=True)
                if href and link_text:
                    links.append({"text": link_text, "href": href})

            return BrowseResult(
                url=url,
                title=title,
                text=text,
                links=links,
                status_code=resp.status_code,
                success=True,
            )
        except Exception as e:
            return BrowseResult(
                url=url,
                title="",
                text="",
                links=[],
                status_code=0,
                success=False,
                error=str(e),
            )

    async def search(self, query: str) -> BrowseResult:
        """Search the web using DuckDuckGo HTML."""
        url = f"https://html.duckduckgo.com/html/?q={query}"
        return await self.browse(url)
