import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { Checkbox } from './Checkbox';
import { Radio } from '../Radio/Radio';

const meta: Meta<typeof Checkbox> = { title: 'Átomos/Checkbox y Radio', component: Checkbox, tags: ['autodocs'] };
export default meta;
export const Checkbox_: StoryObj = { name: 'Checkbox', render: () => { const [on, setOn] = useState(true); return <div className="ds-doc-row"><Checkbox checked={false} /><Checkbox checked={on} onChange={setOn} label="Seleccionar" /></div>; } };
export const Radio_: StoryObj = { name: 'Radio', render: () => <div className="ds-doc-row"><Radio checked={false} /><Radio checked /></div> };
