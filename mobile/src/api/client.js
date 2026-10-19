import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_URL = 'http://localhost:3000';
const ANDROID_EMULATOR_API_URL = 'http://10.0.2.2:3000';

function getApiBaseUrl() {
  // For web platform, always use localhost since browser can't access 10.0.2.2
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
  }

  // For native platforms (iOS, Android), use the configured URL or Android emulator IP
  if (__DEV__) {
    return Constants.expoConfig?.extra?.apiUrl 
      || process.env.EXPO_PUBLIC_API_URL 
      || ANDROID_EMULATOR_API_URL;
  }

  return Constants.expoConfig?.extra?.apiUrl || DEFAULT_API_URL;
}

const API_BASE_URL = getApiBaseUrl();
const REQUEST_TIMEOUT = 10000;

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData = null;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }
      throw new ApiError(
        errorData?.error || errorData?.message || `HTTP ${response.status}`,
        response.status,
        errorData
      );
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network error', 0);
  }
}

export const api = {
  getDevices: () => request('/api/devices'),

  getDevice: (id) => request(`/api/devices/${id}`),

  getReadings: (id, params = {}) => {
    const query = new URLSearchParams();
    if (params.from) query.append('from', params.from);
    if (params.to) query.append('to', params.to);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const qs = query.toString();
    return request(`/api/devices/${id}/readings${qs ? `?${qs}` : ''}`);
  },

  getAlerts: (status = 'open') => request(`/api/alerts?status=${status}`),

  acknowledgeAlert: (id) => request(`/api/alerts/${id}`, { method: 'PATCH' }),

  registerDevice: (device) => request('/api/devices', {
    method: 'POST',
    body: JSON.stringify(device),
  }),
};

export { ApiError, API_BASE_URL };