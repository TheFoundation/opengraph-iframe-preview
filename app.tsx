#!/usr/bin/env -S deno run --allow-net --watch --unstable-kv app.tsx

/** @jsx jsx */
/** @jsxFrag Fragment */
import { Hono } from "https://deno.land/x/hono@v3.11.7/mod.ts";
import { jsx } from "https://deno.land/x/hono@v3.7.2/middleware.ts";

import {
  DOMParser,
  HTMLDocument,
} from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { type Url } from "node:url";
import LRU from "https://deno.land/x/lru@1.0.2/mod.ts";

const CACHE = "CACHE";
//const expireIn = 1000 * 60 * 60 * 24 * 365; // 1 year
const expireIn = 1000 * 60 * 60 * 24 * 7; // 1 week
const expireOGP = 1000 * 60 * 60 * 2; // 2 hours fetch cache
const kv = await Deno.openKv();
const lru = new LRU<Map<string, string>>(100);

async function get(url: string, useCache: boolean,ownhost: string) {
  const map = new Map<string, string>();
  //if (url.indexOf(":ogp.deno.dev") > 0) {
  if (url.indexOf(ownhost) > 0) {
  // static hosting
    return map;
  }
  try {
    if (useCache) {
      const memoryCache = lru.get(url);
      if (memoryCache) {
        console.log("cached_reply "+url);
        return memoryCache;
      }
      const kvCache = await kv.get<Map<string, string>>([CACHE, url]);
      if (kvCache.value) {
        lru.set(url, kvCache.value);
        console.log("kv_reply"+url);
        return kvCache.value;
      }
    }
    ///const kvCache = await kv.get<Map<string, string>>(["CACHEOGP", url]);
    ///if (kvCache.value) {
    ///  //lru.set(url, kvCache.value);
    ///  console.log("kv_fetched_ogp:"+url);
    ///  //return kvCache.value;
    ///  htmltext=kvCache.value
    ///} else {
    ///  console.log("fetch"+url)
    ///  const response: Response = await fetch(url ,{redirect: 'follow'});
    ///  htmltext=await response.text()
    ///  await kv.set(["CACHEOGP", url], htmltext, { expireOGP });
    ///}
    console.log("fetch:"+url)
    const response: Response = await fetch(url );
    //htmltext=await response.text()
    const parser: DOMParser = new DOMParser();
    console.log("parse:"+url)

    const document: HTMLDocument | null = parser.parseFromString(
      await response.text(),
      "text/html",
    );

    if (!document) {
      console.log("no document from "+url)
      return map;
    }
    document.getElementsByTagName("meta").forEach((a) => {
      const name = a.attributes.getNamedItem("name");
      if (name && name.value?.startsWith("twitter:")) {
        const content = a.attributes.getNamedItem("content");
        if (content) {
          map.set(name.value, content.value);
        }
      }
      const property = a.attributes.getNamedItem("property");
      if (property && property.value?.startsWith("og:")) {
        const content = a.attributes.getNamedItem("content");
        if (content) {
          map.set(property.value, content.value);
        }
      }
    });
    document.getElementsByTagName("title").forEach((e) => {
      map.set("title", e.textContent);
    });
    let favicon = document.querySelector("link[rel='icon']")?.getAttribute(
      "href",
    );
    if (!favicon) {
      // Deprecated
      favicon = document.querySelector("link[rel='shortcut icon']")?.getAttribute(
        "href",
      );
    }
    if (!favicon) {
      const u = new URL(url);
      u.pathname = "/favicon.ico";
      u.search = "";
      u.hash = "";
      favicon = u.toString();
    } else if (favicon.startsWith("/")) {
      const u = new URL(url);
      const original = new URL("https://example.com" + favicon);
      u.pathname = original.pathname;
      u.search = original.search;
      u.hash = "";
      favicon = u.toString();
    }
    map.set("favicon", favicon);
    lru.set(url, map);
    kv.set([CACHE, url], map, { expireIn });
    return map;
  } catch (error) {
    return map;
  }
}

type Attr = {
  title: string;
  description: string;
  url: string;
  image: string;
  site: string;
  favicon?: string;
};

function Large({ title, url, image, site, favicon }: Attr) {
  return (
    <div class="card" style="text-wrap: wrap;max-width: 500px; min-height: 150px">
      {image &&
        (
          <img
            src={image}
            class="card-img-top"
            alt={site}
            style="max-heigth: 60%; max-width: 100%"
          />
        )}
      <div
        class="card-body"
        style="overflow: hidden;text-wrap: wrap;"
      >
        <p class="card-text" style="text-wrap: wrap;">
          <small class="text-muted">
             <img src={favicon} style="height: 25px; margin: 5px" />
             <a
              href={encodeURI(url)}
              class="stretched-link"
              style="text-decoration: none;color: black;"
              target="_blank"
            >
              {new URL(url).hostname}
            </a>
          </small>
        </p>
        {title &&
          (
            <div
              class="card-title"
              style="max-width: 500px; white-space: nowrap;text-wrap: wrap;"
            >
              {title}
            </div>
          )}
        {
          /* {description &&
          <p class="card-text">{description}</p>
        } */
        }
      </div>
    </div>
  );
}

function Small({ title, description, url, favicon }: Attr) {
  return (
    <div class="card" style="text-wrap: wrap;min-height: 100px; width: 100%">
      <div class="card-body" style="overflow: hidden; ">
        <h5
          class="card-title"
          style="white-space: nowrap; text-wrap: wrap;"
        >
          <img src={favicon} style="height: 25px; margin: 5px" />
          {title}
        </h5>
        <p
          class="card-text"
          style="max-width: 100%;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;text-wrap: wrap;"
        >
          {description}
        </p>
        <p class="card-text" style="text-wrap: wrap;">
          <small class="text-muted">
            <a href={encodeURI(url)} class="stretched-link" target="_blank">
              {new URL(url).hostname}
            </a>
          </small>
        </p>
      </div>
    </div>
  );
}

function App(
  { map, url, size }: {
    map: Map<string, string>;
    url: string;
    size: string | null;
  },
) {
  let image = map.get("og:image") || map.get("twitter:image:src") || "";
  if (image.startsWith("/")) {
    const u = new URL(url);
    image = u.protocol + "//" + u.host + image;
  }
  const title = map.get("og:title") || map.get("twitter:title") || map.get("title") || "";
  const description = map.get("og:description") ||
    map.get("twitter:description") || "";
  const site = map.get("og:site_name") || map.get("twitter:site") || "";
  const favicon = map.get("favicon");
  const css=Deno.readTextFileSync("my.css");
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
  
       <style>
         {css}
       </style>
      </head>
      <body>
        {size === "small"
          ? (
            <Small
              title={title}
              description={description}
              url={url}
              site={site}
              image={image}
              favicon={favicon}
            />
          )
          : (
            <Large
              title={title}
              description={description}
              url={url}
              site={site}
              image={image}
              favicon={favicon}

            />
          )}
      </body>
    </html>
  );
}

function Default({ baseUrl }: { baseUrl: string }) {
  const css=Deno.readTextFileSync("my.css");
  const exampleUrlLarge = baseUrl + "/?size=large&url=https://github.com";
  const iframeLarge =
    `<iframe src="${exampleUrlLarge}" height="350" width="500"></iframe>`;
  const exampleUrlSmall = baseUrl + "/?size=small&url=https://github.com";
  const iframeSmall =
    `<iframe src="${exampleUrlSmall}" height="150" style="width: 100%;"></iframe>`;
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Open Graph Preview</title>
         
       <style>
         {css}
       </style>
      </head>
      <body>
        <div class="container">
          <h1>Open Graph Preview</h1>
          <div class="alert alert-primary" role="alert">
            Specify "url" Parameter
          </div>
          <h2>Large Example</h2>
          <h3>URL</h3>
          <div>
            <a href={exampleUrlLarge} target="_blank">{exampleUrlLarge}</a>
          </div>
          <h3>Embed Code</h3>
          <div class="card">
            <div class="card-body" style="padding-bottom: 0px">
              <pre><code>{iframeLarge}</code></pre>
            </div>
          </div>
          <h3>Preview</h3>
          <div dangerouslySetInnerHTML={{ __html: iframeLarge }}></div>
          <h2>Small Example</h2>
          <h3>URL</h3>
          <div>
            <a href={exampleUrlSmall} target="_blank">{exampleUrlSmall}</a>
          </div>
          <h3>Embed Code</h3>
          <div class="card">
            <div class="card-body" style="padding-bottom: 0px">
              <pre><code>{iframeSmall}</code></pre>
            </div>
          </div>
          <h3>Preview</h3>
          <div dangerouslySetInnerHTML={{ __html: iframeSmall }}></div>
        </div>
        <br />
      </body>
    </html>
  );
}

const NotFound = () => (
  <div>
    <h1>Page not found</h1>
  </div>
);

const app = new Hono();
app.get("/json", async (c) => {
  const requestUrl = new URL(c.req.url);
  const url = requestUrl.searchParams.get("url");
  const size = requestUrl.searchParams.get("size");
  const ownhost = requestUrl.hostname;
  if (!url) {
    return c.html(<Default baseUrl={requestUrl.origin} />);
  }
  return("hi")
})
app.get("/", async (c) => {
  const requestUrl = new URL(c.req.url);
  const url = requestUrl.searchParams.get("url");
  const size = requestUrl.searchParams.get("size");
  const ownhost = requestUrl.hostname;
  if (!url) {
    return c.html(<Default baseUrl={requestUrl.origin} />);
  }
  let map: Map<string, string>;
  if (new URL(url).hostname === requestUrl.hostname) {
    map = new Map<string, string>();
  } else {
    const useCache = c.req.header("Cache-Control") !== "no-cache";
    map = await get(url, useCache, ownhost);
  }
  return c.html(<App map={map} url={url} size={size} />, {
    headers: { "Cache-Control": "max-age=120" },
  });
})
  .notFound((c) => c.html(<NotFound />));

Deno.serve(app.fetch);