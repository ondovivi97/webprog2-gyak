const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");

// OLDALAK
router.get("/login", (req, res) => res.render("login"));
router.get("/regisztracio", (req, res) => res.render("regisztracio"));

// FORMOK
router.post("/login", auth.loginUser);
router.post("/regisztracio", auth.registerUser);

// KIJELENTKEZÉS
router.get("/logout", auth.logoutUser);

module.exports = router;
