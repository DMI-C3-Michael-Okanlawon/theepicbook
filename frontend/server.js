"use strict";

const express = require("express");
const { engine } = require("express-handlebars");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT || 3000);
const backend = process.env.BACKEND_URL || "http://backend:8080";

function log(level, event, fields = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "frontend",
    level,
    event,
    ...fields
  }));
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    log("info", "request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started
    });
  });
  next();
});

app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.engine("handlebars", engine({ defaultLayout: "main" }));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "frontend" });
});

async function api(route) {
  const response = await fetch(new URL(route, backend), {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }
  return response.json();
}

const money = value => Number(value || 0).toLocaleString("en-US", {
  style: "currency",
  currency: "USD"
});

function bookView(book) {
  return {
    dataValues: {
      ...book,
      price: money(book.price),
      modalhref: `#modal-book-${book.id}`,
      modalId: `modal-book-${book.id}`,
      Author: { dataValues: book.Author || {} }
    }
  };
}

async function navigation() {
  const [categories, cart] = await Promise.all([
    api("/api/categories"),
    api("/api/cart")
  ]);
  return {
    categories: categories.map(genre => ({ DISTINCT: genre })),
    cartCount: cart.cart.length,
    cart
  };
}

const route = handler => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next);
};

app.get("/", route(async (req, res) => {
  const [books, nav] = await Promise.all([
    api("/api/books?limit=9"),
    navigation()
  ]);
  res.render("index", {
    ...nav,
    books: books.map(bookView)
  });
}));

app.post("/category/:categoryName", route(async (req, res) => {
  const genre = req.body.genre;
  if (typeof genre !== "string" || genre.length > 255) {
    return res.status(400).send("Invalid category");
  }
  const [books, nav] = await Promise.all([
    api(`/api/books?genre=${encodeURIComponent(genre)}`),
    navigation()
  ]);
  res.render("category", {
    ...nav,
    books: books.map(bookView)
  });
}));

app.get("/cart", route(async (req, res) => {
  const nav = await navigation();
  res.render("cart", {
    categories: nav.categories,
    cartCount: nav.cartCount,
    subTotal: Number(nav.cart.subTotal || 0).toFixed(2),
    cart: nav.cart.cart.map(item => ({
      dataValues: {
        ...item,
        price: money(item.price),
        Books: (item.Books || []).map(book => ({ dataValues: book }))
      }
    }))
  });
}));

app.get("/gallery", (req, res) => {
  res.render("gallery", { categories: [], cartCount: "" });
});

app.use((req, res) => {
  res.status(404).type("text").send("Page not found");
});

app.use((error, req, res, next) => {
  log("error", "request_failed", { errorType: error.name });
  if (res.headersSent) return next(error);
  const clientError = error.status >= 400 && error.status < 500;
  if (clientError) {
    return res.status(error.status).type("text").send("Invalid request");
  }
  res.status(503).set("Retry-After", "5").type("html").send(
    '<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<title>EpicBook temporarily unavailable</title>' +
    '<main><h1>The bookstore is temporarily unavailable</h1>' +
    '<p>We could not retrieve your books or cart. Please try again shortly.</p>' +
    '<a href="/">Try again</a></main></html>'
  );
});

const server = app.listen(port, "0.0.0.0", () => {
  log("info", "started", { port });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log("info", "shutdown", { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
