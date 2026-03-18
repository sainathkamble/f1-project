import "dotenv/config"
import dotenv from "dotenv"
import connectDB from "./db/index.js";
import { startHttpServer } from "./app.js";
import { startLiveTimingForwarder } from "./controller/livetiming.controller.js";

dotenv.config({
    path: './.env'
})

connectDB().then(() => {
    startHttpServer();
    startLiveTimingForwarder();
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
})