#!/bin/sh
# Starter emulatoren med dataene i /data (lokal/data) og lagrer dem igjen når containeren stoppes.
if [ -f /data/firebase-export-metadata.json ]; then
	exec firebase emulators:start --only firestore,auth --project sion-molde-app --import=/data --export-on-exit=/data
else
	exec firebase emulators:start --only firestore,auth --project sion-molde-app --export-on-exit=/data
fi
