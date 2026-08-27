FROM golang:alpine AS build
WORKDIR /src
COPY . .
RUN go build -o app .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /src/app /app/app
EXPOSE 8080
CMD ["/app/app"]
