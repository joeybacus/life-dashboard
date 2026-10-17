/* The app's lock (Settings → Voucher codes). The preview on your Mac writes this file when
   you set up the master password and voucher Sheet — don't edit it by hand. null = no lock: anyone with the link can open the app.
   Nothing here reveals the password: it holds a check value for it, and the web address of your voucher Sheet. */
export const ACCESS = {
  "v": 3,
  "salt": "p2f1Rhcqgt5cCU6xh7hUPQ",
  "iterations": 310000,
  "check": "yn2ex5qM6g1S3789MQTpHWiiHrvlwKknFlHH9kmlMVc",
  "voucherUrl": "https://script.google.com/macros/s/AKfycbz9WzU0OKse3A7LvJ7kBHrbYryqbV_kZWjU_jSGrUg4rcPV4M05FiRLEk4Nnvm1egT6eQ/exec"
};
