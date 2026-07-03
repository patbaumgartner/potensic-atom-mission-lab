// Exact PotensicPro (Atom) map.db schema, captured from an on-device database:
//   /data/data/com.ipotensic.potensicpro(.debug)/databases/map.db
//
// Verified values from the pulled database:
//   PRAGMA user_version = 5
//   PRAGMA page_size    = 4096
//   PRAGMA encoding     = UTF-8
//   android_metadata.locale = 'en_US_#u-mu-celsius'
//
// Coordinate order: multipointbean stores (lat, lng) as REAL. GeoJSON uses
// [lng, lat]; keep the conversion explicit at the boundaries.

export const ATOM_USER_VERSION = 5;
export const ATOM_PAGE_SIZE = 4096;
export const ATOM_LOCALE = "en_US_#u-mu-celsius";

/** CREATE statements exactly as they appear in the on-device database. */
export const ATOM_CREATE_STATEMENTS: readonly string[] = [
  "CREATE TABLE android_metadata (locale TEXT)",
  "CREATE TABLE flightlog (id integer primary key autoincrement,null_lpcolumn integer, isupload integer, length integer, name text)",
  "CREATE TABLE flightnotes (id integer primary key autoincrement,null_lpcolumn integer, distance real, duration integer, height real, speed real, starttime integer)",
  "CREATE TABLE flightrecordbean (id integer primary key autoincrement,date text, duration integer, height text, mileage text, num integer, speed text)",
  "CREATE TABLE multipointbean (id integer primary key autoincrement,flightrecordbean_id integer, lat real, lng real)",
  "CREATE TABLE table_schema (id integer primary key autoincrement,name text, type integer)",
  "CREATE TABLE uomrecord (id integer primary key autoincrement,sorties integer, uomstatechangedtime integer, uomstateenumname text)",
  "CREATE TABLE uomuploadbody (id integer primary key autoincrement,altitude integer, course integer, flightenumname text, flightsorties integer, flightstatusenumname text, gs integer, height integer, latitude integer, longitude integer, sn text, timemillis integer, vs integer)",
] as const;

/** Seed rows for the table_schema registry, in on-device order. */
export const ATOM_TABLE_SCHEMA_SEED: ReadonlyArray<{
  name: string;
  type: number;
}> = [
  { name: "flightrecordbean", type: 0 },
  { name: "multipointbean", type: 0 },
  { name: "flightnotes", type: 0 },
  { name: "flightlog", type: 0 },
  { name: "uomuploadbody", type: 0 },
  { name: "uomrecord", type: 0 },
];

/** Tables that must exist for PotensicPro to load the database. */
export const ATOM_REQUIRED_TABLES: readonly string[] = [
  "android_metadata",
  "flightlog",
  "flightnotes",
  "flightrecordbean",
  "multipointbean",
  "table_schema",
  "uomrecord",
  "uomuploadbody",
];
