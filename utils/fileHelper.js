const axios = require('axios');
const log = new (require('cat-loggr'))();

class FileOperations {
  constructor(instance) {
    this.instance = instance;
    this.baseUrl = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}`;
    this.auth = {
      username: 'Skyport',
      password: instance.Node.apiKey
    };
  }

  async request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await axios({
        method,
        url,
        data,
        auth: this.auth
      });
      return response.data;
    } catch (error) {
      log.error(`Error in ${method} request to ${endpoint}:`, error);
      return null;
    }
  }

  async fetchFiles(path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const data = await this.request('get', `/files${query}`);
    return data?.files || [];
  }

  async fetchFileContent(filename, path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const data = await this.request('get', `/files/view/${filename}${query}`);
    return data?.content;
  }

  async createFile(filename, content, path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request('post', `/files/create/${filename}${query}`, { content });
  }

  async editFile(filename, content, path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request('post', `/files/edit/${filename}${query}`, { content });
  }

  async deleteFile(filename, path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request('delete', `/files/delete/${filename}${query}`);
  }
}

// Wrapper functions to maintain the original interface
function fetchFiles(instance, path = '') {
  const fileOps = new FileOperations(instance);
  return fileOps.fetchFiles(path);
}

function fetchFileContent(instance, filename, path = '') {
  const fileOps = new FileOperations(instance);
  return fileOps.fetchFileContent(filename, path);
}

function createFile(instance, filename, content, path = '') {
  const fileOps = new FileOperations(instance);
  return fileOps.createFile(filename, content, path);
}

function editFile(instance, filename, content, path = '') {
  const fileOps = new FileOperations(instance);
  return fileOps.editFile(filename, content, path);
}

function deleteFile(instance, filename, path = '') {
  const fileOps = new FileOperations(instance);
  return fileOps.deleteFile(filename, path);
}

module.exports = {
  fetchFiles,
  fetchFileContent,
  createFile,
  editFile,
  deleteFile
};