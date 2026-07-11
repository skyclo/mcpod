import Docker from "dockerode"

let docker = null

/** Lazily-created shared Dockerode instance (default socket / DOCKER_HOST). */
export function getDocker() {
    if (!docker) docker = new Docker()
    return docker
}

/**
 * Verify the Docker daemon is reachable.
 * @returns {Promise<string>} daemon version string
 */
export async function ensureDaemon(dockerInstance = getDocker()) {
    try {
        const version = await dockerInstance.version()
        return version.Version
    } catch (err) {
        throw new Error(
            `Docker daemon is not reachable (${err.code ?? err.message}). Is Docker running?`
        )
    }
}
