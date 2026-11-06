FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Manrope TTFs (src/lib/fonts) so the logo bake uses the same letterforms
# as the website preview instead of the image's fallback sans-serif.
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig \
  && mkdir -p /usr/share/fonts/manrope && cp src/lib/fonts/*.ttf /usr/share/fonts/manrope/ \
  && fc-cache -f /usr/share/fonts && rm -rf /var/lib/apt/lists/*
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
