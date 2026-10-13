"use strict";

const express = require("express");
const cors = require("cors");
const db = require("./models");

const app = express();
const port = Number(process.env.PORT || 8080);
const origins = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

function log(level, event, fields = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "backend",
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

app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.has(origin)) {
      return callback(null, true);
    }
    const error = new Error("Origin not allowed");
    error.status = 403;
    callback(error);
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 600
}));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

const route = handler => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next);
};

app.get("/health", route(async (req, res) => {
  try {
    await db.sequelize.authenticate();
    await db.Book.findOne({ attributes: ["id"] });
    res.json({ status: "ok", service: "backend", database: "ready" });
  } catch (error) {
    log("warn", "health_failed", { errorType: error.name });
    res.status(503).json({
      status: "unavailable",
      service: "backend",
      database: "not_ready"
    });
  }
}));

app.get("/api/books", route(async (req, res) => {
  const options = {
    include: [db.Author],
    order: [["id", "ASC"]],
    limit: 100
  };

  if (req.query.limit !== undefined) {
    const limit = Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "limit must be from 1 to 100" });
    }
    options.limit = limit;
  }

  if (req.query.genre !== undefined) {
    if (typeof req.query.genre !== "string" || req.query.genre.length > 255) {
      return res.status(400).json({ error: "Invalid genre" });
    }
    options.where = { genre: req.query.genre };
  }

  res.json(await db.Book.findAll(options));
}));

app.get("/api/categories", route(async (req, res) => {
  const rows = await db.Book.findAll({
    attributes: ["genre"],
    group: ["genre"],
    order: [["genre", "ASC"]],
    raw: true
  });
  res.json(rows.map(row => row.genre));
}));

app.get("/api/cart", route(async (req, res) => {
  const cart = await db.Cart.findAll({
    include: [{ model: db.Book, through: { attributes: [] } }],
    order: [["id", "ASC"]]
  });

  const totalCents = cart.reduce(
    (total, item) => total + Math.round(Number(item.price) * 100),
    0
  );

  res.json({
    cart,
    subTotal: (totalCents / 100).toFixed(2)
  });
}));

app.post("/api/cart", route(async (req, res) => {
  const bookId = Number(req.body.bookId);
  if (!Number.isSafeInteger(bookId) || bookId < 1) {
    return res.status(400).json({ error: "A valid bookId is required" });
  }

  const book = await db.Book.findByPk(bookId);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }

  const cart = await db.sequelize.transaction(async transaction => {
    const item = await db.Cart.create(
      { price: book.price, quantity: 1 },
      { transaction }
    );
    await item.addBook(book, { transaction });
    return item;
  });

  res.status(201).json({ ...cart.toJSON(), book });
}));

app.delete("/api/cart/delete", route(async (req, res) => {
  await db.sequelize.transaction(async transaction => {
    await db.sequelize.models.Cartbook.destroy({
      where: {},
      transaction
    });
    await db.Cart.destroy({ where: {}, transaction });
  });
  res.json({ message: "Cart cleared" });
}));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  log("error", "request_failed", { errorType: error.name });
  if (res.headersSent) return next(error);

  const clientError = error.status >= 400 && error.status < 500;
  const databaseError = error.name.startsWith("Sequelize");
  const status = clientError ? error.status : databaseError ? 503 : 500;

  res.status(status).json({
    error: clientError
      ? "Invalid or disallowed request"
      : databaseError
        ? "Database temporarily unavailable"
        : "Request could not be completed"
  });
});

// Schema creation and seeding are separate deployment operations.
const server = app.listen(port, "0.0.0.0", () => {
  log("info", "started", { port });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log("info", "shutdown", { signal });
    server.close(async () => {
      try {
        await db.sequelize.close();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
