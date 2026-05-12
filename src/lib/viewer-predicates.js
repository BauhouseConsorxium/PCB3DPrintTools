export function isCopper(name) {
  const n = name.toLowerCase();
  return n.includes("copper") || n.includes(".cu") || n.includes("_cu");
}

export function isPinHousingBase(name) {
  return name.startsWith('SocketBase_pcb');
}

export function isPcbBoard(name) {
  const n = name.toLowerCase();
  return !isCopper(name) && !isPinHousing(name) && !isPinHousingBase(name) && (n.includes("_pcb") || n.endsWith("pcb"));
}

export function isPinHousing(name) {
  return name.startsWith('Socket_pcb') && !isPinHousingBase(name);
}

export function isSilkscreen(name) {
  const n = name.toLowerCase();
  return n.includes("silks");
}

export function isCopperText(name) {
  return name.endsWith("_text") && isCopper(name);
}

export function isEnclosure(name) {
  return name.toLowerCase() === "enclosure";
}

export function isJumper(name) {
  return name.startsWith('Jumper_');
}

export function isComponent(name) {
  return (
    !isCopper(name) &&
    !isPcbBoard(name) &&
    !isEnclosure(name) &&
    !isSilkscreen(name) &&
    !isJumper(name) &&
    !isPinHousing(name) &&
    !isPinHousingBase(name)
  );
}
