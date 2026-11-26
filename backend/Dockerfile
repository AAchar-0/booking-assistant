# Backend image. Build from the backend/ folder:  docker build -t booking-api backend
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so Docker can reuse this layer when only source code changes.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY db ./db
COPY scripts ./scripts

USER node
EXPOSE 8080
# Apply any new database migrations, then start. If a migration fails the container stops, which is what we want.
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
