const URL = "http://localhost:8080/sessionLogin";
const loginBtn = document.getElementById("login");

if (loginBtn) {
  loginBtn.onclick = async () => {
    try {
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebase.auth().signInWithPopup(provider);
      // console.log("result", result);
      // console.log("id token: ", result.user.getIdToken());
      const { isNewUser } = result.additionalUserInfo;
      const userIdToken = await result.user.getIdToken();
      const res = await fetch(URL, {
        method: "POST",
        redirect: "follow",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid: result.user.uid, idToken: userIdToken }),
      });
      // console.log(res);
      firebase.auth().signOut();
      if (isNewUser) {
        window.location.replace("/logout");
      } else {
        window.location.replace("/");
      }
    } catch (error) {
      const { code, message } = error;
      console.error({ code });
      console.error({ message });
    }
  };
}
