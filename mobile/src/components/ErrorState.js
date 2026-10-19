import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export const ErrorState = ({ message, onRetry, retryLabel = 'Retry' }) => (
  <View style={styles.container}>
    <Text style={styles.title}>Error</Text>
    <Text style={styles.message}>{message}</Text>
    {onRetry && (
      <Button title={retryLabel} onPress={onRetry} style={styles.button} />
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#D32F2F',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
});