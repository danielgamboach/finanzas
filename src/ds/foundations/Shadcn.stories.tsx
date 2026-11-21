import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import {
  Button, StatusBadge, Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter,
  Alert, AlertTitle, AlertDescription, AvatarRoot, AvatarImage, AvatarFallback, Label, Switch, Checkbox,
  RadioGroup, RadioGroupItem, Separator, Field, FieldSet, FieldLegend, Input, Tabs, TabsList, TabsTrigger, TabsContent,
  Menu, MenuItem, MenuLabel, MenuSeparator, Icon,
} from '../index';

const meta: Meta = { title: 'Fundamentos/shadcn' };
export default meta;

/** Las mismas piezas con la anatomía y los nombres de shadcn/ui. Colores, tipos y radios siguen saliendo de tokens.json. */
export const Piezas: StoryObj = {
  render: function Render() {
    const [on, setOn] = useState(true);
    const [chk, setChk] = useState(false);
    const [plan, setPlan] = useState('mensual');
    return (
      <div style={{ display: 'grid', gap: 24, maxWidth: 390 }}>
        <div className="ds-doc-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button>default</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="outline">outline</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="destructive">destructive</Button>
          <Button variant="link">link</Button>
          <Button size="icon-sm" variant="secondary" aria-label="Agregar"><Icon name="plus" size={16} /></Button>
          <Button asChild variant="outline" size="sm"><a href="#/cuentas">asChild (enlace)</a></Button>
        </div>
        <div className="ds-doc-row" style={{ gap: 8 }}>
          <StatusBadge variant="default">default</StatusBadge>
          <StatusBadge variant="secondary">secondary</StatusBadge>
          <StatusBadge variant="outline">outline</StatusBadge>
          <StatusBadge variant="warning">warning</StatusBadge>
          <StatusBadge variant="ai">ai</StatusBadge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Tarjeta Kimmy</CardTitle>
            <CardDescription>Corte el 15 · pago el 2</CardDescription>
            <CardAction><Button size="xs" variant="secondary">Pagar</Button></CardAction>
          </CardHeader>
          <CardContent className="type-body-sm">Lo que debés hoy: 182.400 CRC</CardContent>
          <CardFooter><Button block variant="outline" size="sm">Ver movimientos</Button></CardFooter>
        </Card>
        <Alert variant="warning" icon={<Icon name="warning" size={20} />}>
          <AlertTitle>Restaurantes al 85%</AlertTitle>
          <AlertDescription>Quedan 12.000 CRC para 9 días.</AlertDescription>
        </Alert>
        <div className="ds-doc-row" style={{ gap: 16, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <AvatarRoot><AvatarImage src="/icon.svg" /><AvatarFallback>K</AvatarFallback></AvatarRoot>
          <AvatarRoot color="mint"><AvatarImage src="/no-existe.png" /><AvatarFallback>🍟</AvatarFallback></AvatarRoot>
          <Separator orientation="vertical" />
          <Label><Switch checked={on} onCheckedChange={setOn} /> Notificaciones</Label>
          <Label><Checkbox checked={chk} onCheckedChange={setChk} /> Recordar</Label>
        </div>
        <FieldSet>
          <FieldLegend>Recurrente</FieldLegend>
          <Field label="Nombre"><Input placeholder="Netflix" /></Field>
          <RadioGroup value={plan} onValueChange={setPlan}>
            <Label htmlFor="r-m"><RadioGroupItem id="r-m" value="mensual" /> Mensual</Label>
            <Label htmlFor="r-a"><RadioGroupItem id="r-a" value="anual" /> Anual</Label>
          </RadioGroup>
        </FieldSet>
        <Tabs defaultValue="cat">
          <TabsList><TabsTrigger value="cat">Categorías</TabsTrigger><TabsTrigger value="ten">Tendencias</TabsTrigger></TabsList>
          <TabsContent value="cat"><p className="type-body-sm">Panel de categorías</p></TabsContent>
          <TabsContent value="ten"><p className="type-body-sm">Panel de tendencias</p></TabsContent>
        </Tabs>
        <Menu label="Espacio">
          <MenuLabel>Espacios</MenuLabel>
          <MenuItem selected>Personal de Dani</MenuItem>
          <MenuItem>Simbiosis</MenuItem>
          <MenuSeparator />
          <MenuItem muted>Crear espacio</MenuItem>
        </Menu>
      </div>
    );
  },
};
