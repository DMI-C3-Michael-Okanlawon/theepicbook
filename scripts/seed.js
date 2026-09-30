"use strict";

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const db = require("../models");

async function main() {
  const url = new URL(process.env.JAWSDB_URL);

  await db.sequelize.sync();

  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
    multipleStatements: true,
  });

  try {
    if ((await db.Author.count()) === 0) {
      await connection.query(
        fs.readFileSync(path.join(__dirname, "../db/author_seed.sql"), "utf8")
      );
      console.log("Loaded authors");
    } else {
      console.log("Authors already present");
    }

    if ((await db.Book.count()) === 0) {
      await connection.query(
        fs.readFileSync(path.join(__dirname, "../db/books_seed.sql"), "utf8")
      );
      console.log("Loaded books");
    } else {
      console.log("Books already present");
    }
  } finally {
    await connection.end();
    await db.sequelize.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
