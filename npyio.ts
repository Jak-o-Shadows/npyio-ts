var fs = require('fs');


function string_replace_all(input: string, old: string, rep: string): string {
    // TODO: figure out how to use ES2021 and the string.replaceAll method
    while( input.includes(old) ){
        input = input.replace(old, rep);
    }
    return input;
}


function nd_array_read(buf, row, dims: number[], dim_num: number, count: number, base_offset: number, offset_increment: number, data_type: string){

    if( dim_num < 0 ){
        // we have gone through all the dimensions
        return [row, base_offset]
    } else if ( dim_num >= 1 ) {
        // Still parsing down the dimensions
        console.log(`Dim ${dim_num} has count ${count} starting at offset ${base_offset}`);
        dim_num--;
        let new_offset: number = base_offset;
        let ret: any[] = [];  // TODO: stricter type. This is an array of [number, any[]]
        for(let idx=0; idx<(count-1); idx++ ){
            ret = nd_array_read(buf, [], dims, dim_num, dims[dim_num], new_offset, offset_increment, data_type);
            new_offset = ret[1];
            row.push(ret[0]);
        }
        return [row, base_offset]
    } else if ( dim_num == 0 ){
        // Read the row
        let value: number;
        for(let idx=0; idx<count; idx++ ){
            base_offset += offset_increment;
            switch( data_type ){
                case 'uint8':
                    value = buf.readUint8LE(base_offset);
                    break;
                case 'int8':
                    value = buf.readInt8LE(base_offset);
                    break;
                case 'uint16':
                    value = buf.readUint16LE(base_offset);
                    break;
                case 'int16':
                    value = buf.readInt16LE(base_offset);
                    break;
                case 'uint32':
                    value = buf.readUint32(base_offset);
                    break;
                case 'int32':
                    value = buf.readInt32(base_offset);
                    break;
                case 'float32':
                    value = buf.readFloatLE(base_offset);
                    break;
                case 'float64':
                    value = buf.readDoubleLE(base_offset);
                    break;
                default:
                    console.log(`data type ${data_type} not recognised. SKIPPING`);
                    value = NaN;
                    break;
            }
            console.log(`Buffer Index ${base_offset} is ${value}`);
            row.push(value);
        }
        return [row, base_offset]
    }
    return [row, base_offset]  // TODO: ugly hack shut the type checker up

}


export function read_npy(filepath: string) {

    // Read the whole dang thing into memory
    let buf: Buffer = fs.readFileSync(filepath);

    let data: any[] = [];  // TODO: How do I type a defined at runtime multi-dimensional array?  //TODO: Other variables in the compound type


    // Check that it is indeed a numpy data file
    // TODO


    // Get the format description
    let headerLen: number = buf.readUint16LE(8);
    console.log(`Header is ${headerLen} bytes`);
    let header: string = buf.toString('utf8', 9+1, 9+headerLen);
    // Do some hacky string replacement to convert from Python dict to JSON
    header = string_replace_all(header, 'False', '"FALSE"');
    header = string_replace_all(header, 'True', '"TRUE"');
    header = string_replace_all(header, "'", '"');  // Swap string quotation mark to "
    header = string_replace_all(header, '(', '[');
    header = string_replace_all(header, ')', ']');
    header = string_replace_all(header, ', }', '}');  // Remove trailing ,
    header = string_replace_all(header, ' ', '');  // Remove spaces
    //header = string_replace_all(header, ',"shape":[89,94]', '');

    let bufferOffsetToData: number = 9+headerLen+1;

    console.log(`Header is '${header}'`);
    let headerParsed = JSON.parse(header);

    let fields = headerParsed.descr;
    console.log(`fields is '${fields}'`);
    let numData = headerParsed.shape.reduce((product: number, current: number) => product * current, 1);
    // Fields may be a python list of tuples, or it may be a single thing
    if( fields[0] == '[' ){
        // It is a tuple
        console.log(`${filepath} is a compound datatype. SKIPPING`);
    } else {
        // It is a single value
        let offsetIncrements: Array<number> = [0];
        let sizes: Array<number> = [0];
        let types: Array<string> = [];
        let fieldIndex: number = 0;
        switch( fields ){
            case '|u1':
                // Uint8
                console.log('\tIs a uint8');
                sizes[fieldIndex] = 1;
                types[fieldIndex] = 'uint8';
                break;
            case '|i1':
                // Int8
                console.log('\tIt is a int8');
                sizes[fieldIndex] = 1;
                types[fieldIndex] = 'int8';
                break;
            case '<u2':
                // Uint16
                console.log('\tIs a uint16');
                sizes[fieldIndex] = 2;
                types[fieldIndex] = 'uint16';
                break;
            case '<i2':
                // Int16
                console.log('\tIt is a int16');
                sizes[fieldIndex] = 2;
                types[fieldIndex] = 'int16';
                break;
            case '<u4':
                // Uint32
                console.log('\tIs a uint32');
                sizes[fieldIndex] = 4;
                types[fieldIndex] = 'uint32';
                break;
            case '<i4':
                // Int32
                console.log('\tIt is a int32');
                sizes[fieldIndex] = 4;
                types[fieldIndex] = 'int32';
                break;
            case '<f4':
                // Float32
                console.log('\tIt is a float32');
                sizes[fieldIndex] = 4;
                types[fieldIndex] = 'float32';
                break;
            case '<f8':
                // Float64
                console.log('\tIt is a float64');
                sizes[fieldIndex] = 8;
                types[fieldIndex] = 'float64';
                break;
            default:
                console.log(`Field ${fields} not recognised. SKIPPING`);
                break;
        }

        offsetIncrements[fieldIndex] = sizes.slice(0, fieldIndex+1).reduce(
            (sum: number, current:number) => sum + current, 0
        );


        let ret = nd_array_read(buf,
            data,
            headerParsed.shape,
            headerParsed.shape.length-1,
            headerParsed.shape[headerParsed.shape.length-1],
            bufferOffsetToData,
            offsetIncrements[fieldIndex],
            types[fieldIndex]);
        data = ret[0]
    }

    // TODO: properly return the actual data
    return data;
}

export function write_npy(filepath: string, data: Buffer, header: string) {
    // Write the Header

    // Calculate the header length to put in
    let rem: number = 64 - ((header.length + 10) % 64);
    let header_len: number = header.length + rem;
    console.log(`Rem: ${rem}`);

    //let header_len: number = header.length + 10;  // was header.length + 57, for some reason
    console.log(`Binary file Header length ${header_len}`);
    let array: Uint8Array = new Uint8Array([0x93,  // Magic
                                            0x4e, // N
                                            0x55, // U
                                            0x4d, // M
                                            0x50, // P
                                            0x59, /// Y
                                            1,      // Major Version
                                            0,      // Minor Version
                                            header_len & 0xFF,
                                            header_len >> 8]);
    // Write
    let fd: number = fs.openSync(filepath, 'w');
    fs.writeSync(fd, array);
    fs.writeSync(fd, header);
    // Get current position in file
    let stats = fs.fstatSync(fd);
    console.log(`Bytes written ${stats.size}`);
    let shortage: number = 64 - (stats.size % 64);
    console.log(`Spacing Required: ${shortage}`);
    for( let i=0;i<shortage-1;i++ ){
        fs.writeSync(fd, ' ');
    }
    fs.writeSync(fd, '\n');

    // Write the actual data
    fs.writeSync(fd, data);

    fs.closeSync(fd);
}