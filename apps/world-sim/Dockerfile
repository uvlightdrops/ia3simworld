FROM golang:alpine AS build
# Cache buster to force re-compiling latest main.go with spacious landscape, embed and centering fixes
RUN echo "building fresh"
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o app .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /src/app /app/app
EXPOSE 8081
CMD ["/app/app"]
