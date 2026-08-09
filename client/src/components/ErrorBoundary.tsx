import { Component } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button } from '@mui/material';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={this.handleReset}>
              Try again
            </Button>
          }
        >
          Something went wrong on this page.
        </Alert>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
