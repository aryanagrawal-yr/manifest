// Settings for the app. No secrets belong in this file (the site is public).
window.APP_CONFIG = {
  // PRIVATE GitHub repo where records are stored (one JSON file per dispatch).
  // The app refuses to run if this repo is public.
  owner: "aryanagrawal-yr",
  repo: "manifest-data",
  branch: "main",

  partners: ["Delhivery", "DTDC", "Shadowfax", "RobeHive", "Bluedart", "Ecom Express", "XpressBees"],
  vehicleTypes: ["Bike", "Scooter", "Auto", "Tempo", "Van", "Mini Truck", "Truck", "Other"]
};
