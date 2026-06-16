// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lib::log;

fn main() {
    mobile_lib::run();
    log("Test test 123")
}
