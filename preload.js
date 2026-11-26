// GENERATED from src/main/preload.ts by scripts/build-core.mjs — do not edit
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
var invoke = (ch, ...args) => import_electron.ipcRenderer.invoke(ch, ...args);
var send = (ch, ...args) => import_electron.ipcRenderer.send(ch, ...args);
var on = (ch, cb) => {
  import_electron.ipcRenderer.on(ch, (_e, d) => cb(d));
};
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("os-" + process.platform);
  if (process.platform !== "darwin") {
    const st = document.createElement("style");
    st.textContent = "#titlebar{padding:0 150px 0 14px !important}";
    document.head.appendChild(st);
  }
});
var api = {
  platform: "desktop",
  os: process.platform,
  capabilities: { vcg: true, api: true, csv: true, files: true, mt5: true },
  setSource: (src) => send("set-source", src),
  saveEA: () => invoke("save-ea"),
  fetchJSON: (url) => invoke("fetch-json", url),
  fetchText: (url) => invoke("fetch-text", url),
  onQuotes: (cb) => on("quotes", cb),
  onStatus: (cb) => on("status", cb),
  onChart: (cb) => on("chart", cb),
  onNet: (cb) => on("net", cb),
  signOut: () => invoke("sign-out"),
  onLogs: (cb) => on("logs", cb),
  requestChart: (o) => send("chart-request", o),
  pushChart: (d) => send("chart-data", d),
  pushAnalysis: (a) => send("analysis", a),
  onApiCmd: (cb) => on("api-cmd", cb),
  apiResult: (r) => send("api-cmd-result", r),
  claudeSetup: (o) => invoke("claude-setup", o),
  claudeStatus: () => invoke("claude-status"),
  mt5InstallEA: () => invoke("mt5-install-ea"),
  mt5EASource: () => invoke("mt5-ea-source"),
  mt5Launch: (o) => invoke("mt5-launch", o),
  openSite: (url) => invoke("open-site", url),
  onMt5Auto: (cb) => on("mt5-auto", cb),
  mt5AutoNow: () => invoke("mt5-auto-now"),
  mt5UpdateEA: () => invoke("mt5-update-ea"),
  mt5EAInfo: () => invoke("mt5-ea-info"),
  mt5OpenEditor: () => invoke("mt5-open-editor"),
  onEAUpdate: (cb) => on("ea-update", cb),
  journalGet: () => invoke("journal-get"),
  journalSync: () => invoke("journal-sync"),
  journalExport: (csv) => invoke("journal-export", csv),
  onJournal: (cb) => on("journal-changed", () => cb()),
  mt5Positions: (on_) => invoke("mt5-positions", on_),
  mt5Deals: (from, to) => invoke("mt5-deals", from, to),
  onPositions: (cb) => on("positions", cb),
  claudeDisable: () => invoke("claude-disable"),
  log: (level, msg, data, source = "ui") => send("log", { level, msg, data, source }),
  notify: (event, payload, text) => invoke("notify", { event, payload, text }),
  getSettings: () => invoke("get-settings"),
  setSettings: (s) => invoke("set-settings", s),
  openLogFile: () => send("open-log-file"),
  openLogFolder: () => send("open-log-folder"),
  addSymbol: (s) => send("add-symbol", s),
  removeSymbol: (s) => send("remove-symbol", s),
  setTray: (s) => send("set-tray", s),
  toggleCsv: () => send("toggle-csv"),
  openCsv: () => send("open-csv"),
  showTrader: () => send("show-trader"),
  reloadTrader: () => send("reload-trader")
};
import_electron.contextBridge.exposeInMainWorld("vcg", api);
