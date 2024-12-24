// @ts-ignore
import RCCClient from "@megahdrive/rccclient-node";
// @ts-ignore
import ScriptExecution from "@megahdrive/rccclient-node/ScriptExecution";
// @ts-ignore
import Job from "@megahdrive/rccclient-node/Job";
import { v4 } from "uuid";
import logger from "./logger";
import config from "./config";
import child_process from "child_process";

const { execFile, exec } = child_process;

const RCCService2016 = config.RCCService.VersionPaths["2016"];
const RCCServiceRenderer = config.RCCService.VersionPaths["Renderer"];

function NewJobId(JobType: Number): string {
    switch (JobType) {
        case 0:
            return `gameserver-${v4()}`;
        case 1:
            return `render-${v4()}`;
        default:
            return `unknown-${v4()}`;
    }
}

async function CloseProcess(pid?: number) {
    if (pid === undefined) {
        logger.error("CloseProcess called without pid");
        return;
    }
    exec(`taskkill /pid ${pid} /f`, (error, stdout, stderr) => {
        if (error) {
            logger.error(`err closing process (JS): ${error.message}`);
            return;
        }
        if (stderr) {
            logger.error(`stderr from CloseProcess: ${stderr}`);
            return;
        }
    });
}

function waitMs(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function RunGameServer(placeId: number, creatorId: number, year: number, jobid?: string) {
    const JobId = jobid || NewJobId(0);
    const SOAPPort = Math.floor(Math.random() * (config.RCCService.SOAP.EndPort - config.RCCService.SOAP.StartPort) + config.RCCService.SOAP.StartPort);
    const GameServerPort = Math.floor(Math.random() * (config.RCCService.GameServer.EndPort - config.RCCService.GameServer.StartPort) + config.RCCService.GameServer.StartPort);

    const Parameters = [`/Console`, `/Port`, `${SOAPPort}`, `/Verbose`];
    const GameServerFile = Bun.file(`./scripts/${year}/GameServer.lua`);
    const StartTime = Date.now();
    let FullScript;
    let ExePath;
    let WorkingDir;
    let IsJSONRcc = year >= 2017;

    if (!IsJSONRcc) {
        if (!await GameServerFile.exists()) {
            logger.error(`error during RunGameServer: file './scripts/${year}/GameServer.lua' does not exist`);
            return;
        } else if (GameServerFile.type !== "text/x-lua") {
            logger.error(`error during RunGameServer: file './scripts/${year}/GameServer.lua' is not a lua file`);
            return;
        }
        FullScript = `-- GAMESERVER.LUA DYNAMICEDIT
local url = "${config.BaseUrl}";
local port = ${GameServerPort};
local placeId = ${placeId};
local creatorType = Enum.CreatorType.User;
local creatorId = ${creatorId};
local placeVersionId = 0;
local vipServerOwnerId = 0;
local isDebugServer = false;
-- BEGIN GAMESERVER

${await GameServerFile.text()}`;
    } else {
        // get actual main url from baseurl "http://www.moonic.wtf" -> "moonic.wtf"
        const domain = config.BaseUrl.replace(/(^\w+:|^)\/\//, '');
        FullScript = {
            Mode: "GameServer",
            Settings: {
                PlaceId: placeId,
                CreatorId: creatorId,
                GameId: JobId,
                MachineAddress: `${config.MachineAddress}`,
                MaxPlayers: 20,
                GsmInterval: 5,
                MaxGameInstances: 69420,
                PreferredPlayerCapacity: 20,
                UniverseId: placeId,
                BaseUrl: `${domain}`,
                PlaceFetchUrl: `${config.BaseUrl}/Asset/?id=${placeId}`,
                MatchmakingContextId: 1,
                CreatorType: "User",
                PlaceVersion: 1,
                PreferredPort: GameServerPort,
                JobId: jobid,
                ApiKey: "SjmJpdkGxecwm4f7AMsBDgAuQ2xfSewDU8D5CBWDFWYBSmAG7771Pf9YEjqmGTjFgqZ6quK8EDYnBeaMKDQ",
                PlaceVisitAccessKey: "kaFtSHd3Zm0asg04KGztjV9ZxfuEKVr2P62BvkeMMGhha"
            }
        }
    }

    logger.info(`starting gameserver with JobId ${JobId}`);

    switch (year) {
        case 2016:
            ExePath = `${RCCService2016}\\RCCService.exe`;
            WorkingDir = `${RCCService2016}`;
            break;
        case 2018:
            break;
        default:
            logger.error(`error during RunGameServer: year ${year} is not supported`);
            return;
    }

    try {
        if (!ExePath) {
            throw new Error(`Executable path is undefined for year ${year}`);
        }
        const options = { cwd: WorkingDir, stdio: 'ignore' };
        const task = execFile(ExePath, Parameters, options);

        task.on('error', (err) => {
            logger.error(`Process error: ${err.message}`);
            task.kill();
        });

        task.on('exit', (code) => {
            logger.info(`Process exited with code: ${code}`);
        });

        logger.info(`rccservice${year} started with pid ${task.pid}`);
        await waitMs(750);
        const Service = new RCCClient("127.0.0.1", SOAPPort);
        const GameServerJob = new Job(JobId, 640000000);

        if (IsJSONRcc) {
            FullScript = JSON.stringify(FullScript);
        }
        const ScriptFRFR = new ScriptExecution("GameServer", FullScript);
        logger.info(`sending OpenJob for ${JobId}...`);

        const result: any = await new Promise(async (resolve, reject) => {
            Service.OpenJob(GameServerJob, ScriptFRFR, (data: any) => {
                if (data) {
                    if (data.status === 500) {
                        reject(new Error(`OpenJob failed with status 500`));
                    } else {
                        reject(new Error(`unhandled data with status ${data.status}`));
                    }
                } else {
                    resolve(null);
                }
            });
        });

        let portInUse = false;
        let portCheckCount = 0;
        const maxRetries = 20;

        logger.info(`waiting for NetworkServer on port (${GameServerPort})`);
        while (!portInUse && portCheckCount < maxRetries) {
            try {
                const portCheck = await new Promise((resolve, reject) => {
                    const portCheckTask = exec(`netstat -ano | findstr :${GameServerPort}`, (error, stdout, stderr) => {
                        if (error) {
                            reject(error);
                        }
                        if (stderr) {
                            reject(stderr);
                        }
                        resolve(stdout);
                    });
                    portCheckTask.on('error', reject);
                });
                if (portCheck) {
                    portInUse = true;
                }
            } catch (error) {
                await waitMs(250);
                portCheckCount++;
            }
        }

        if (!portInUse) {
            throw new Error("Port is not in use after max retries");
        }

        logger.info(`done - attempts until started: ${portCheckCount}`);
        logger.info(`gameserver ${JobId} OK in ${Date.now() - StartTime}ms!`);

        return {
            success: true,
            message: "gameserver started",
            error: null,
            jobid: JobId,
            gameport: GameServerPort,
            soapport: SOAPPort,
            pid: task.pid
        };
    } catch (error: any) {
        logger.error(`error during RunGameServer: ${error}`);
        // @ts-ignore
        if (task && task.pid) {
            // @ts-ignore
            task.kill();
        }
        return {
            success: false,
            message: "error starting gameserver",
            error: error,
            jobid: null,
            gameport: null,
            soapport: null,
            pid: null
        };
    }
}

export default {
    NewJobId,
    CloseProcess,
    RunGameServer,
};
