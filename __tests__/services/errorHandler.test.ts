import { showError } from '../../services/errorHandler';
import { Alert } from 'react-native';

// Mock Alert.alert
jest.spyOn(Alert, 'alert');

describe('errorHandler', () => {
    it('should call Alert.alert with the correct message', () => {
        const message = 'Test Error Message';
        showError(message);
        expect(Alert.alert).toHaveBeenCalledWith('오류', message);
    });
});
