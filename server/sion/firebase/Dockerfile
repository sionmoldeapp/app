# Firebase-emulatoren (Firestore + innlogging) for testversjonen på PC-en.
# Erstatter Java- og firebase-tools-installasjonen på PC-en (lokal/start-test.bat).
FROM node:22-bookworm-slim
COPY --from=eclipse-temurin:21-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:$PATH
RUN npm install -g firebase-tools@15.34.2 && npm cache clean --force
WORKDIR /app
# Last ned emulatorene når bildet bygges, ikke ved hver oppstart
RUN firebase setup:emulators:firestore && firebase setup:emulators:auth || true
COPY start.sh /start.sh
CMD ["/bin/sh", "/start.sh"]
