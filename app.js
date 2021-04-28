require("dotenv").config();
const admin = require("firebase-admin");
const cookieParser = require("cookie-parser");
const express = require("express");
const { checkCookieMiddleware } = require("./middlewares");

const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIRESTORE_URL,
});

const auth = admin.auth();
const db = admin.firestore();

async function setCustomClaimsToUser(uid, medStaffRef) {
  const medicalStaffInDB = await medStaffRef.get();
  if (medicalStaffInDB.exists) {
    auth.setCustomUserClaims(uid, {
      isMedicalStaff: true,
      isPatient: false,
    });
  } else {
    auth.setCustomUserClaims(uid, {
      isMedicalStaff: false,
      isPatient: true,
    });
  }
}

const app = express();

app.set("view engine", "ejs");
app.use(cookieParser());
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) => res.render("home"));

app.get("/patient", checkCookieMiddleware, async (req, res) => {
  const { isPatient, email } = req.decodedClaims;
  if (!isPatient) return res.redirect("/unauthorized");
  try {
    const dataToTemplate = {
      isEmpty: false,
      records: [],
    };
    const orderRequstsRef = db.collection("orderRequests");
    const snapshot = await orderRequstsRef
      .where("email", "==", email)
      .limit(5)
      .get();
    if (snapshot.empty) {
      dataToTemplate.isEmpty = true;
    } else {
      snapshot.forEach((doc) => {
        dataToTemplate.records.push(doc.data());
      });
    }
    res.render("patient", dataToTemplate);
  } catch (error) {
    console.error({ error });
    res.status(500).send("unexpected error. contact the admin.");
  }
});

app.post("/patient", checkCookieMiddleware, async (req, res) => {
  const { isPatient, email, name, uid } = req.decodedClaims;
  if (!isPatient) return res.redirect("/unauthorized");
  try {
    const { symptoms, symptomDays, deliverTo } = req.body;
    const docId = `${uid}_${Date.now()}`;
    const data = {
      docId,
      name,
      email,
      deliverTo,
      symptoms,
      symptomDays: Number(symptomDays),
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const orderRequstsRef = db.collection("orderRequests");
    const writeResult = await orderRequstsRef.doc(docId).set(data);
    console.log(`Document written at: ${writeResult.writeTime.toDate()}`);
    res.redirect("/patient");
  } catch (error) {
    console.error({ error });
    res
      .status(503)
      .send(
        "error occured during database update. Please try again after a few minutes."
      );
  }
});

app.get("/medicalStaff", checkCookieMiddleware, async (req, res) => {
  const { isMedicalStaff, name } = req.decodedClaims;
  if (!isMedicalStaff) return res.redirect("/unauthorized");
  try {
    const dataToTemplate = {
      isEmpty: false,
      staffName: name,
      records: [],
    };
    const snapshot = await db.collection("orderRequests").get();
    if (snapshot.empty) {
      dataToTemplate.isEmpty = true;
    } else {
      snapshot.forEach((doc) => {
        dataToTemplate.records.push(doc.data());
      });
    }
    res.render("medicalStaff", dataToTemplate);
  } catch (error) {
    console.error({ error });
    res.status(503).send("unexpected error. contact the admin.");
  }
});

app.post("/medicalStaff", checkCookieMiddleware, async (req, res) => {
  const { isMedicalStaff, name, email } = req.decodedClaims;
  if (!isMedicalStaff) return res.redirect("/unauthorized");
  try {
    const { docId } = req.body;
    const orderRequstsRef = db.collection("orderRequests");
    const deleteResponse = await orderRequstsRef.doc(docId).delete();
    console.log(`Document deleted at: ${deleteResponse.writeTime.toDate()}`);
    const data = {
      ...req.body,
      prescribedByName: name,
      prescribedByEmail: email,
    };
    const ordersRef = db.collection("orders");
    const writeResult = await ordersRef.doc(docId).set(data);
    console.log(`Document written at: ${writeResult.writeTime.toDate()}`);
    res.redirect("/medicalStaff");
  } catch (error) {
    console.error({ error });
    res
      .status(503)
      .send(
        "error occured during database update. Please try again after a few minutes."
      );
  }
});

app.get("/orders", checkCookieMiddleware, async (req, res) => {
  const { isMedicalStaff } = req.decodedClaims;
  if (!isMedicalStaff) return res.redirect("/unauthorized");
  try {
    const data = {
      isEmpty: false,
      records: [],
    };
    const snapshot = await db.collection("orders").get();
    if (snapshot.empty) {
      data.isEmpty = true;
    } else {
      snapshot.forEach((doc) => {
        data.records.push(doc.data());
      });
    }
    res.render("orders", data);
  } catch (error) {
    console.error({ error });
    res
      .status(503)
      .send(
        "error occured during database update. Please try again after a few minutes."
      );
  }
});

app.get("/login", (_, res) => res.render("login"));

app.post("/sessionLogin", async (req, res) => {
  const { uid, idToken } = req.body;
  // const idToken = req.body.idToken.toString();
  // const csrfToken = req.body.csrfToken.toString();
  // Guard against CSRF attacks.
  // if (csrfToken !== req.cookies.csrfToken) {
  //   res.status(403).send("UNAUTHORIZED REQUEST!");
  //   return;
  // }
  const expiresIn = 5 * 24 * 60 * 60 * 1000;
  const options = { maxAge: expiresIn, httpOnly: true, secure: true };
  try {
    const medStaffRef = db.collection("medicalStaffs").doc(uid);
    setCustomClaimsToUser(uid, medStaffRef);
    const sessionToken = await auth.createSessionCookie(idToken, {
      expiresIn,
    });
    res.cookie("session", sessionToken, options);
    res.end(JSON.stringify({ status: "success" }));
  } catch (error) {
    console.error({ error });
    res.redirect("/unauthorized");
  }
});

app.get("/logout", async (req, res) => {
  res.clearCookie("session");
  try {
    const sessionCookie = req.cookies.session || "";
    const decodedClaims = await auth.verifySessionCookie(sessionCookie);
    auth.revokeRefreshTokens(decodedClaims.uid, true);
  } catch (error) {
    console.error({ error });
  }
  res.redirect("/");
});

app.get("/unauthorized", (_, res) => res.status(403).render("unauthorized"));

app.get("*", (_, res) => res.status(404).render("404"));

app.listen(process.env.PORT || 8080);
