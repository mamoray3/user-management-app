const API_BASE_URL = process.env.API_BASE_URL;

/**
 * API client for communicating with the backend
 */
class ApiClient {
  constructor(accessToken = null) {
    this.accessToken = accessToken;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  // Users API
  async getUsers(filter = null) {
    const queryString = filter ? `?status=${filter}` : '';
    return this.request(`/users${queryString}`);
  }

  async getUser(id) {
    return this.request(`/users/${id}`);
  }

  async createUser(userData) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id, userData) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  async approveUser(id, approverEmail) {
    return this.request(`/users/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approvedBy: approverEmail }),
    });
  }
}

export default ApiClient;
