import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResumeTailoringConfigView from './ResumeTailoringConfigView';

describe('ResumeTailoringConfigView', () => {
  it('disables start tailoring until at least one section is selected', () => {
    render(
      <ResumeTailoringConfigView
        selectedSections={[]}
        onToggleSection={() => {}}
        tailoringIntensity="balanced"
        onSelectIntensity={() => {}}
        onStartTailoring={() => {}}
        onBack={() => {}}
        loading={false}
        validationMessage="Select at least one resume section to continue."
      />
    );

    expect(screen.getByRole('button', { name: /start tailoring/i })).toBeDisabled();
    expect(screen.getByText('Select at least one resume section to continue.')).toBeInTheDocument();
  });

  it('allows selecting sections and intensity', () => {
    const toggleSection = jest.fn();
    const selectIntensity = jest.fn();

    render(
      <ResumeTailoringConfigView
        selectedSections={['summary']}
        onToggleSection={toggleSection}
        tailoringIntensity="balanced"
        onSelectIntensity={selectIntensity}
        onStartTailoring={() => {}}
        onBack={() => {}}
        loading={false}
        validationMessage=""
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /professional summary/i }));
    fireEvent.click(screen.getByRole('button', { name: /aggressive/i }));

    expect(toggleSection).toHaveBeenCalledWith('summary');
    expect(selectIntensity).toHaveBeenCalledWith('aggressive');
  });
});
