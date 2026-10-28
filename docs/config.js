// Settings for the app. No secrets belong in this file (the site is public).
window.APP_CONFIG = {
  // PRIVATE GitHub repo where records are stored (one JSON file per dispatch).
  // The app refuses to run if this repo is public.
  owner: "aryanagrawal-yr",
  repo: "manifest-data",
  branch: "main",

  partners: ["Delhivery", "DTDC", "Shadowfax", "RobeHive", "Bluedart", "Ecom Express", "XpressBees"],
  vehicleTypes: ["Bike", "Scooter", "Auto", "Tempo", "Van", "Mini Truck", "Truck", "Other"],

  // Text printed on the manifest PDF (matches the supplied design)
  brand: {
    title: "ROBEHIVE LOGISTICS",
    tagline: "Your logistics partner",
    documentTitle: "PICKUP MANIFEST",
    vendor: "Youth Robe",
    footer: "Powered by YOUTH ROBE - Your Trusted logistics partner",
    url: "app.robehive.in",
    copies: ["VENDOR COPY", "ROBEHIVE LOGISTICS COPY", "COURIER COPY"]
  }
};
