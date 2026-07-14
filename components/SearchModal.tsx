import React from 'react';
import { Modal } from 'react-native';
import { SearchScreen } from '../SearchScreen';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  mode?: 'foods' | 'swaps';
}

export const SearchModal: React.FC<SearchModalProps> = ({ visible, onClose, mode = 'foods' }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SearchScreen onBack={onClose} mode={mode} />
    </Modal>
  );
};
