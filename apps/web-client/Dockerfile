FROM node:20-alpine
# Cache buster to force compiling latest index.tsx with Center on Human button and v1.0.78 version update
RUN echo "building web client fresh"
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
