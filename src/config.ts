// @ts-ignore
import bfj from 'bfj';
import fs from 'fs';
import logger from './logger';

if (!fs.existsSync('./config.json')) {
    logger.fatal("no config.json in current directory. exiting.");
    process.exit(1);
}

const config = await bfj.read('./config.json');
logger.info("config read");
interface Config {
    ArbiterPort: number;
    BaseUrl: string;
    RCCService: {
        VersionPaths: {
            [key: string]: string;
        };
        SOAP: {
            StartPort: number;
            EndPort: number;
        };
        GameServer: {
            StartPort: number;
            EndPort: number;
        };
    };
}

function validateConfig(config: any): config is Config {
    return (
        typeof config.ArbiterPort === 'number' &&
        typeof config.BaseUrl === 'string' &&
        typeof config.MachineAddress === 'string' &&
        typeof config.RCCService === 'object' &&
        typeof config.RCCService.VersionPaths === 'object' &&
        Object.values(config.RCCService.VersionPaths).every(path => typeof path === 'string') &&
        typeof config.RCCService.SOAP === 'object' &&
        typeof config.RCCService.SOAP.StartPort === 'number' &&
        typeof config.RCCService.SOAP.EndPort === 'number' &&
        typeof config.RCCService.GameServer === 'object' &&
        typeof config.RCCService.GameServer.StartPort === 'number' &&
        typeof config.RCCService.GameServer.EndPort === 'number'
    );
}

if (!validateConfig(config)) {
    logger.fatal("invalid configuration format. exiting.");
    process.exit(1);
}
export default config;