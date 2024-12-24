import logger from "./src/logger";
import functions from "./src/functions";
import config from "./src/config";
import express from "express";

const app = express();

app.all("*", (req, _, next) => {
    logger.info(`received request: ${req.method} ${req.url}`);
    next();
});

app.get("/", (_, res) => {
    res.send("ok");
});

app.get("/games/:placeId/start", async (req, res) => {
    const placeId = parseInt(req.params.placeId);
    const creatorId = parseInt(req.query.creatorId as string);
    const jobId = req.query.jobId as string;
    const year = 2016;
    // TODO: Get year from placeId
    if (isNaN(placeId) || isNaN(creatorId) || isNaN(year)) {
        res.status(400).send("invalid parameters");
        return;
    }


    try {
        const Task = await functions.RunGameServer(placeId, creatorId, year, jobId);
        if (Task === undefined) {
            res.status(500).send("internal error");
            return;
        }
    
        res.status(200).json(Task);
    } catch (err) {
        logger.error(`error during /games/${placeId}/start: ${err}`);
        res.status(500).send("internal error");
    }
});

app.all("*", (req, res) => {
    res.status(404).send("not found");
});

app.listen(config.ArbiterPort, () => {
    logger.info(`arbiter listening on port ${config.ArbiterPort} with base url ${config.BaseUrl}`);
});