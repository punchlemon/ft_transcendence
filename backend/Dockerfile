FROM node:18-bullseye

WORKDIR /app

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Install deps based on package.json
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

EXPOSE 3000

# Use ts-node-dev for hot reload during development
CMD ["npm", "run", "dev"]
