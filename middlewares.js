const { auth } = require("firebase-admin");

module.exports = {
  checkCookieMiddleware: async (req, res, next) => {
    try {
      const sessionCookie = req.cookies.session || "";
      const decodedClaims = await auth().verifySessionCookie(
        sessionCookie,
        true
      );
      req.decodedClaims = decodedClaims;
      next();
    } catch (error) {
      // console.error({ error });
      res.redirect("/login");
    }
  },
};
