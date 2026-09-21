FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:8787/api/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
