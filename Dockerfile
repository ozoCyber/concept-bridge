FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json server.js demo-lessons.js start-local.js ./
COPY public ./public

ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860
EXPOSE 7860
CMD ["node", "--use-env-proxy", "server.js"]
