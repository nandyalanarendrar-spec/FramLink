# FarmLink: one image that builds the React app and serves it from the Express server (same origin, no CORS).
FROM node:24-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/ server/
COPY --from=client /app/client/dist client/dist

# Uploaded crop photos and ID documents live here. Mount a volume on it, or they vanish when the container is replaced.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
VOLUME ["/data/uploads"]

EXPOSE 5000
WORKDIR /app/server
CMD ["node", "src/server.js"]
