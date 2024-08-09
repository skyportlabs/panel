const axios = require('axios');

/**
 * Fetches files for a given instance.
 * @param {Object} instance - The instance object.
 * @param {string} path - The path to fetch files from.
 * @returns {Promise<Array>} - The list of files.
 */
async function fetchFiles(instance, path = '') {
    const query = path ? `?path=${path}` : '';
    const url = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files${query}`;
    
    try {
    const response = await axios.get(url, {
        auth: {
            username: 'Skyport',
            password: instance.Node.apiKey
        }
    });

    return response.data.files || [];
    } catch (error) {
        return [];
    }
}





/**
 * Fetches content of a specific file.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to fetch.
 * @param {string} path - The path of the file.
 * @returns {Promise<string>} - The content of the file.
 */
async function fetchFileContent(instance, filename, path = '') {
    const query = path ? `?path=${path}` : '';
    const url = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/view/${filename}${query}`;
    

    try {
    const response = await axios.get(url, {
        auth: {
            username: 'Skyport',
            password: instance.Node.apiKey
        }
    });
    return response.data.content;
    } catch (error) {
        console.error('Error fetching file content:', error);
        return null;
    }

}

/**
 * Creates a new file on the daemon.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to create.
 * @param {string} content - The content of the file.
 * @param {string} path - The path where to create the file.
 * @returns {Promise<Object>} - The response from the server.
 */
async function createFile(instance, filename, content, path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const url = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/create/${filename}${query}`;
    
    try {
        const response = await axios.post(url, { content }, {
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error creating file:', error);
        return null;
    }
}

/**
 * Edits an existing file.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to edit.
 * @param {string} content - The new content of the file.
 * @param {string} path - The path of the file.
 * @returns {Promise<Object>} - The response from the server.
 */
async function editFile(instance, filename, content, path = '') {
    const query = path ? `?path=${path}` : '';
    const url = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/edit/${filename}${query}`;
    
    const response = await axios.post(url, { content }, {
        auth: {
            username: 'Skyport',
            password: instance.Node.apiKey
        }
    });

    return response.data;
}

/**
 * Deletes a file.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to delete.
 * @param {string} path - The path of the file.
 * @returns {Promise<Object>} - The response from the server.
 */
async function deleteFile(instance, filename, path = '') {
    const query = path ? `?path=${path}` : '';
    const url = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/delete/${filename}${query}`;
    
    const response = await axios.delete(url, {
        auth: {
            username: 'Skyport',
            password: instance.Node.apiKey
        }
    });

    return response.data;
}

module.exports = {
    fetchFiles,
    fetchFileContent,
    createFile,
    editFile,
    deleteFile
};
